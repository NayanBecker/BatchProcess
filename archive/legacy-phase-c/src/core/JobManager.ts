import { resolveJobConfig, JobConfigInput, validateSqlTimeouts } from './jobConfig';
import { TransactionalBatchJob, TransactionalSpec } from './TransactionalBatchJob';
import { PersistenceContext } from '../db/models/BatchJobModel';
import { EventEmitter } from 'events';
import { BatchJobModel, BatchJobErrorModel, BatchJobLogModel } from '../db/models';
import { db } from '../db/conection';
import { BatchExecutor } from './BatchExecutor';
import { JobRegistry, create as createJobInstance } from './JobRegistry';
import {
    JobStatus,
    JobEventType,
    JobEvent,
    SystemStats,
    JobDTO,
    JobConfig
} from '../types';

/**
 * Configuração do JobManager
 */
export interface JobManagerConfig {
    maxConcurrentJobs: number;
    pollIntervalMs?: number; // interval para buscar jobs pendentes
    defaultJobConfig?: Partial<JobConfig>;
}

/**
 * Gerenciador central de jobs
 *
 * Responsável por:
 * - Gerenciar lifecycle de múltiplos jobs concorrentes
 * - Distribuir jobs para workers
 * - Emitir eventos do sistema
 * - Fornecer métricas e estatísticas
 */
export class JobManager extends EventEmitter {
    private static instance: JobManager | null = null;
    private config: Required<JobManagerConfig>;
    private executors: Map<number, BatchExecutor> = new Map(); // jobId -> executor
    private workerExecutors: Map<string, BatchExecutor> = new Map(); // workerId -> executor
    private isRunning: boolean = false;
    private pollInterval?: NodeJS.Timeout;
    private transactionalBusy = false;
    private stopping = false;
    private pollTask?: Promise<void>;
    private activeRuns = new Set<Promise<unknown>>();

    private track<T>(run: Promise<T>): Promise<T> {
        this.activeRuns.add(run);
        void run.finally(() => this.activeRuns.delete(run)).catch(() => {});
        return run;
    }

    private constructor(config: JobManagerConfig) {
        super();
        this.config = {
            maxConcurrentJobs: config.maxConcurrentJobs || 5,
            pollIntervalMs: config.pollIntervalMs || 5000,
            defaultJobConfig: config.defaultJobConfig || {}
        };
    }

    /**
     * Singleton: obter instância única do JobManager
     */
    static getInstance(config?: JobManagerConfig): JobManager {
        if (!JobManager.instance) {
            if (!config) {
                throw new Error('JobManager não inicializado. Passe config na primeira chamada.');
            }
            JobManager.instance = new JobManager(config);
        }
        return JobManager.instance;
    }

    /**
     * Inicia o JobManager (inicia polling por jobs pendentes)
     */
    async start(): Promise<void> {
        if (this.stopping) throw new Error('Shutdown em andamento');
        if (this.transactionalBusy) throw new Error('Worker experimental exige exclusividade local');
        if (this.isRunning) {
            console.warn('[JobManager] Já está rodando');
            return;
        }

        this.isRunning = true;
        console.log(`[JobManager] Iniciando com maxConcurrentJobs=${this.config.maxConcurrentJobs}`);

        // Iniciar polling periódico por jobs pendentes
        this.pollInterval = setInterval(() => {
            this.pollAndDispatch().catch(err => {
                console.error('[JobManager] Erro no poll:', err);
            });
        }, this.config.pollIntervalMs);

        // disparar primeira busca imediatamente
        await this.pollAndDispatch();

        // Não criar log com job_id=0 (violaria FK). Registrar localmente apenas.
        console.log('[JobManager] iniciado');
    }

    /**
     * Para o JobManager (cancela todos os jobs em execução)
     */
    async stop(): Promise<void> {
        this.stopping = true;
        this.isRunning = false;

        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = undefined;
        }

        try {
            for (const executor of this.workerExecutors.values()) executor.requestPause();
            await Promise.allSettled(this.pollTask ? [this.pollTask] : []);
            for (const executor of this.workerExecutors.values()) executor.requestPause();
            await Promise.allSettled([...this.activeRuns]);
        } finally {
            this.stopping = false;
        }

        console.log('[JobManager] JobManager parado');
    }

    /**
     * Verifica se o JobManager está rodando
     */
    getIsRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Inicia um novo job (cria registro e dispatch)
     */
    async startJob(
        jobName: string,
        options?: {
            config?: Partial<JobConfig>;
            scheduled_at?: Date;
            tags?: string[];
            priority?: number;
            immediate?: boolean; // se true, ignora scheduled_at
        }
    ): Promise<JobDTO> {
        // Verificar se job está registrado
        if (!JobRegistry.has(jobName)) {
            throw new Error(`Job "${jobName}" não encontrado no registry`);
        }

        const definition = createJobInstance(jobName);
        if (definition instanceof TransactionalBatchJob) throw new Error('Job transacional exige contexto explícito via runTransactional');
        const mergedConfig = resolveJobConfig(
            definition.config, this.config.defaultJobConfig, options?.config ?? {}
        );
        definition.config = mergedConfig;
        await definition.validate();

        // Criar registro no banco
        const jobRow = await BatchJobModel.create(jobName, {
            ...mergedConfig,
            scheduled_at: options?.scheduled_at || null,
            tags: options?.tags || [],
            priority: options?.priority || 0
        });

        const jobDTO = BatchJobModel.toDTO(jobRow);

        // Emitir evento
        this.emitEvent({
            type: 'job:queued',
            jobId: Number(jobRow.id),
            jobName: jobRow.job_name,
            timestamp: new Date(),
            data: jobDTO
        });

        // Se for imediato, tentar dispatch agora
        if (options?.immediate !== false && !options?.scheduled_at) {
            await this.pollAndDispatch();
        }

        return jobDTO;
    }

    /**
     * Pausa um job em execução
     */
    async pauseJob(jobId: number): Promise<JobDTO> {
        // Parar executor local se existir
        const executor = this.executors.get(jobId);
        if (executor) {
            // Notificar executor para parar (ele verifica paused status)
            // Mas primeiro atualizar BD
            const jobRow = await BatchJobModel.pause(jobId);
            this.emitEvent({
                type: 'job:paused',
                jobId,
                jobName: jobRow.job_name,
                timestamp: new Date()
            });
            return BatchJobModel.toDTO(jobRow);
        }

        // Se não está local, apenas atualizar BD (executor remoto verá na próxima iteração)
        const jobRow = await BatchJobModel.pause(jobId);
        return BatchJobModel.toDTO(jobRow);
    }

    /**
     * Retoma um job pausado
     */
    async resumeJob(jobId: number): Promise<JobDTO> {
        const jobRow = await BatchJobModel.resume(jobId);

        this.emitEvent({
            type: 'job:resumed',
            jobId,
            jobName: jobRow.job_name,
            timestamp: new Date()
        });

        // Tentar dispatch (pode pegar este job no próximo poll)
        await this.pollAndDispatch();

        return BatchJobModel.toDTO(jobRow);
    }

    /**
     * Cancela (stopped) um job
     */
    async stopJob(jobId: number): Promise<JobDTO> {
        const jobRow = await BatchJobModel.cancel(jobId);

        const executor = this.executors.get(jobId);
        if (executor) {
            // Remover do mapa local (o executor vai existir até terminar o batch atual?)
            // Melhor: não matar, apenas marcar cancelled e o loop do executor para sozinho
        }

        return BatchJobModel.toDTO(jobRow);
    }

    /**
     * Remove um job da tabela (hard delete)
     */
    async deleteJob(jobId: number): Promise<void> {
        // Não permitir deletar job em execução
        const job = await BatchJobModel.findById(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} não encontrado`);
        }

        if (job.status === 'running') {
            throw new Error(`Não é possível deletar job em execução (id=${jobId}). Pause primeiro.`);
        }

        await BatchJobModel.delete(jobId);
    }

    /**
     * Busca status atual de um job (completo)
     */
    async getJobStatus(jobId: number): Promise<JobDTO | null> {
        const jobRow = await BatchJobModel.findById(jobId);
        if (!jobRow) {
            return null;
        }
        return BatchJobModel.toDTO(jobRow);
    }

    /**
     * Lista todos os jobs com filtros
     */
    async listJobs(filters?: {
        status?: JobStatus;
        job_name?: string;
        page?: number;
        limit?: number;
    }): Promise<{ jobs: JobDTO[]; total: number }> {
        const page = filters?.page || 1;
        const limit = filters?.limit || 50;
        const offset = (page - 1) * limit;

        const jobs = await BatchJobModel.findAll(
            {
                status: filters?.status,
                job_name: filters?.job_name
            },
            { page, limit }
        );

        const total = await db('batch_jobs')
            .count('id as count')
            .first()
            .then(r => Number(r?.count ?? 0));

        return {
            jobs: jobs.map(job => BatchJobModel.toDTO(job)),
            total
        };
    }

    /**
     * Busca logs de um job
     */
    async getJobLogs(jobId: number, pagination?: { page: number; limit: number }): Promise<any[]> {
        const logs = await BatchJobLogModel.findByJobId(jobId, pagination);
        return logs;
    }

    /**
     * Busca erros de um job
     */
    async getJobErrors(jobId: number, pagination?: { page: number; limit: number }): Promise<any[]> {
        const errors = await BatchJobErrorModel.findByJobId(jobId, pagination);
        return errors;
    }

    /**
     * Busca estatísticas do sistema
     */
    async getSystemStats(): Promise<SystemStats> {
        const jobsByStatus = await BatchJobModel.countByStatus();
        const activeWorkers = this.workerExecutors.size;
        const queueLength = jobsByStatus.pending;

        // Calcular média de duração dos jobs completados recentemente
        const recentJobs = await BatchJobModel.findAll(
            { status: 'completed' },
            { page: 1, limit: 100 }
        );

        const avgDuration = recentJobs.length > 0
            ? recentJobs.reduce((sum, job) => {
                const start = job.started_at ? new Date(job.started_at).getTime() : 0;
                const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
                return sum + (end - start);
            }, 0) / recentJobs.length
            : 0;

        const totalItems = await db('batch_jobs')
            .sum('processed_rows as total')
            .first()
            .then(r => r.total || 0);

        const totalErrors = await db('batch_job_errors').count('id as count')
            .first()
            .then(r => Number(r?.count ?? 0));

        return {
            totalJobs: Object.values(jobsByStatus).reduce((a, b) => a + b, 0),
            jobsByStatus,
            activeWorkers,
            queueLength,
            avgJobDurationMs: avgDuration,
            totalItemsProcessed: totalItems,
            totalErrors
        };
    }

    /**
     * Polling: busca jobs pendentes e dispatch para workers
     */
    private pollAndDispatch(): Promise<void> {
        if (this.pollTask) return this.pollTask;
        const task = this.pollOnce();
        this.pollTask = task;
        void task.finally(() => { if (this.pollTask === task) this.pollTask = undefined; }).catch(() => {});
        return task;
    }

    private async pollOnce(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        const currentJobs = this.executors.size;

        if (currentJobs >= this.config.maxConcurrentJobs) {
            // Já atingiu limite de concorrência
            return;
        }

        // Buscar próximo job pendente (já considera scheduled_at)
        const workerId = `worker-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const jobRow = await BatchJobModel.findNextPending(workerId);

        if (!jobRow) {
            return; // Nenhum job pendente
        }

        // Criar executor para este job
        await this.dispatchJob(jobRow, workerId);
    }

    /**
     * Dispatch: inicia execução de um job em um worker
     */
    private async dispatchJob(jobRow: any, workerId: string): Promise<void> {
        // Verificar se job está registrado
        const jobClass = createJobInstance(jobRow.job_name, jobRow.effective_config ?? {
            batchSize: jobRow.batch_size,
            throttleMs: jobRow.throttle_ms
        });

        if (!jobClass) {
            console.error(`[JobManager] Job "${jobRow.job_name}" não encontrado no registry`);
            await BatchJobModel.fail(Number(jobRow.id));
            return;
        }

        const executor = new BatchExecutor(workerId);

        // Configurar listeners de eventos
        executor.on('jobCompleted', (jid, count) => {
            this.emitEvent({
                type: 'job:completed',
                jobId: jid,
                jobName: jobRow.job_name,
                timestamp: new Date(),
                data: { itemsProcessed: count }
            });
        });

        executor.on('jobFailed', (jid, error) => {
            this.emitEvent({
                type: 'job:failed',
                jobId: jid,
                jobName: jobRow.job_name,
                timestamp: new Date(),
                data: { error: error.message }
            });
        });

        executor.on('jobError', async (jid, error, recordId) => {
            await BatchJobModel.incrementErrorCount(jid);
            this.emitEvent({
                type: 'job:error',
                jobId: jid,
                jobName: jobRow.job_name,
                timestamp: new Date(),
                data: { error: error.message, recordId }
            });
        });


        // Guardar referências
        this.executors.set(Number(jobRow.id), executor);
        this.workerExecutors.set(workerId, executor);

        // Executar job em background (não await)
        if (this.stopping) executor.requestPause();
        this.track(executor.run(jobRow, jobClass).catch(err => {
            console.error(`[JobManager] Erro ao executar job ${jobRow.id}:`, err);
        }).finally(() => {
            this.executors.delete(Number(jobRow.id));
            this.workerExecutors.delete(workerId);
        }));

        this.emitEvent({
            type: 'job:started',
            jobId: Number(jobRow.id),
            jobName: jobRow.job_name,
            timestamp: new Date()
        });

        await BatchJobLogModel.create(Number(jobRow.id), 'info', `Job iniciado pelo JobManager (worker=${workerId})`);
    }

    /**
     * Emite evento do sistema (compatível com listener externo)
     */
    private emitEvent(event: JobEvent): void {
        this.emit('event', event);
        // Emitir também evento específico
        this.emit(event.type as string, event);
    }

    /**
     * Obtém todos os workers ativos
     */
    runTransactional(name: string, context: PersistenceContext, spec: TransactionalSpec, options: JobConfigInput = {}) {
        return this.track(this.executeTransactional(name, context, spec, options));
    }

    private async executeTransactional(name: string, context: PersistenceContext, spec: TransactionalSpec, options: JobConfigInput) {
        if (this.stopping) throw new Error('Shutdown em andamento');
        if (this.transactionalBusy || this.executors.size || this.isRunning) throw new Error('Worker experimental exige exclusividade local');
        this.transactionalBusy = true; // reserve synchronously, before any await
        const worker = `transactional-${process.pid}`;
        try {
            const job = createJobInstance(name);
            if (!(job instanceof TransactionalBatchJob)) throw new Error('Job transacional não registrado');
            job.config = resolveJobConfig(job.config, this.config.defaultJobConfig, options);
            validateSqlTimeouts(spec);
            await job.validate();
            const row = await BatchJobModel.createTransactional(name, job.config, spec, context, job.validateInitial?.bind(job));
            const executor = new BatchExecutor(worker, context);
            this.workerExecutors.set(worker, executor);
            if (this.stopping) executor.requestPause();
            await executor.run(row, job);
            return await BatchJobModel.findById(row.id, context);
        } finally {
            this.workerExecutors.delete(worker);
            this.transactionalBusy = false;
        }
    }

    /** Dispatch an explicitly requeued fixture; never recreates H or validates a clean dataset on resume. */
    runQueuedTransactional(id: number, context: PersistenceContext) {
        return this.track(this.executeQueuedTransactional(id, context));
    }

    private async executeQueuedTransactional(id: number, context: PersistenceContext) {
        if (this.stopping) throw new Error('Shutdown em andamento');
        if (this.transactionalBusy || this.executors.size || this.isRunning) throw new Error('Worker experimental exige exclusividade local');
        this.transactionalBusy = true;
        const worker = `transactional-${process.pid}`;
        try {
            const row = await BatchJobModel.findById(id, context);
            if (!row?.transactional_state || row.status !== 'pending') throw new Error('Job transacional não está pendente');
            const job = createJobInstance(row.job_name, row.effective_config);
            if (!(job instanceof TransactionalBatchJob)) throw new Error('Job transacional não registrado');
            const executor = new BatchExecutor(worker, context);
            this.workerExecutors.set(worker, executor);
            if (this.stopping) executor.requestPause();
            await executor.run(row, job);
            return await BatchJobModel.findById(id, context);
        } finally {
            this.workerExecutors.delete(worker);
            this.transactionalBusy = false;
        }
    }

    getActiveWorkers(): string[] {
        return Array.from(this.workerExecutors.keys());
    }

    /**
     * Obtém executors ativos (jobId -> executor)
     */
    getActiveExecutors(): Map<number, BatchExecutor> {
        return new Map(this.executors);
    }
}
