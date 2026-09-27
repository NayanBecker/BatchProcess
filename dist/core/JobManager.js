"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobManager = void 0;
const events_1 = require("events");
const models_1 = require("../db/models");
const conection_1 = require("../db/conection");
const BatchExecutor_1 = require("./BatchExecutor");
const JobRegistry_1 = require("./JobRegistry");
/**
 * Gerenciador central de jobs
 *
 * Responsável por:
 * - Gerenciar lifecycle de múltiplos jobs concorrentes
 * - Distribuir jobs para workers
 * - Emitir eventos do sistema
 * - Fornecer métricas e estatísticas
 */
class JobManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.executors = new Map(); // jobId -> executor
        this.workerExecutors = new Map(); // workerId -> executor
        this.isRunning = false;
        this.config = {
            maxConcurrentJobs: config.maxConcurrentJobs || 5,
            pollIntervalMs: config.pollIntervalMs || 5000,
            defaultJobConfig: config.defaultJobConfig || {}
        };
    }
    /**
     * Singleton: obter instância única do JobManager
     */
    static getInstance(config) {
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
    async start() {
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
    async stop() {
        if (!this.isRunning) {
            return;
        }
        this.isRunning = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = undefined;
        }
        // Cancelar todos os jobs em execução
        const runningJobs = await models_1.BatchJobModel.findAll({ status: 'running' });
        for (const job of runningJobs) {
            await this.pauseJob(job.id);
        }
        console.log('[JobManager] JobManager parado');
    }
    /**
     * Verifica se o JobManager está rodando
     */
    getIsRunning() {
        return this.isRunning;
    }
    /**
     * Inicia um novo job (cria registro e dispatch)
     */
    async startJob(jobName, options) {
        // Verificar se job está registrado
        if (!JobRegistry_1.JobRegistry.has(jobName)) {
            throw new Error(`Job "${jobName}" não encontrado no registry`);
        }
        // Mesclar configuração
        const mergedConfig = {
            ...this.config.defaultJobConfig,
            ...options?.config
        };
        // Criar registro no banco
        const jobRow = await models_1.BatchJobModel.create(jobName, {
            ...mergedConfig,
            scheduled_at: options?.scheduled_at || null,
            tags: options?.tags || [],
            priority: options?.priority || 0
        });
        const jobDTO = models_1.BatchJobModel.toDTO(jobRow);
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
    async pauseJob(jobId) {
        // Parar executor local se existir
        const executor = this.executors.get(jobId);
        if (executor) {
            // Notificar executor para parar (ele verifica paused status)
            // Mas primeiro atualizar BD
            const jobRow = await models_1.BatchJobModel.pause(jobId);
            this.emitEvent({
                type: 'job:paused',
                jobId,
                jobName: jobRow.job_name,
                timestamp: new Date()
            });
            return models_1.BatchJobModel.toDTO(jobRow);
        }
        // Se não está local, apenas atualizar BD (executor remoto verá na próxima iteração)
        const jobRow = await models_1.BatchJobModel.pause(jobId);
        return models_1.BatchJobModel.toDTO(jobRow);
    }
    /**
     * Retoma um job pausado
     */
    async resumeJob(jobId) {
        const jobRow = await models_1.BatchJobModel.resume(jobId);
        this.emitEvent({
            type: 'job:resumed',
            jobId,
            jobName: jobRow.job_name,
            timestamp: new Date()
        });
        // Tentar dispatch (pode pegar este job no próximo poll)
        await this.pollAndDispatch();
        return models_1.BatchJobModel.toDTO(jobRow);
    }
    /**
     * Cancela (stopped) um job
     */
    async stopJob(jobId) {
        const jobRow = await models_1.BatchJobModel.cancel(jobId);
        const executor = this.executors.get(jobId);
        if (executor) {
            // Remover do mapa local (o executor vai existir até terminar o batch atual?)
            // Melhor: não matar, apenas marcar cancelled e o loop do executor para sozinho
        }
        return models_1.BatchJobModel.toDTO(jobRow);
    }
    /**
     * Remove um job da tabela (hard delete)
     */
    async deleteJob(jobId) {
        // Não permitir deletar job em execução
        const job = await models_1.BatchJobModel.findById(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} não encontrado`);
        }
        if (job.status === 'running') {
            throw new Error(`Não é possível deletar job em execução (id=${jobId}). Pause primeiro.`);
        }
        await models_1.BatchJobModel.delete(jobId);
    }
    /**
     * Busca status atual de um job (completo)
     */
    async getJobStatus(jobId) {
        const jobRow = await models_1.BatchJobModel.findById(jobId);
        if (!jobRow) {
            return null;
        }
        return models_1.BatchJobModel.toDTO(jobRow);
    }
    /**
     * Lista todos os jobs com filtros
     */
    async listJobs(filters) {
        const page = filters?.page || 1;
        const limit = filters?.limit || 50;
        const offset = (page - 1) * limit;
        const jobs = await models_1.BatchJobModel.findAll({
            status: filters?.status,
            job_name: filters?.job_name
        }, { page, limit });
        const total = await (0, conection_1.db)('batch_jobs')
            .count('id as count')
            .first()
            .then(r => Number(r?.count ?? 0));
        return {
            jobs: jobs.map(job => models_1.BatchJobModel.toDTO(job)),
            total
        };
    }
    /**
     * Busca logs de um job
     */
    async getJobLogs(jobId, pagination) {
        const logs = await models_1.BatchJobLogModel.findByJobId(jobId, pagination);
        return logs;
    }
    /**
     * Busca erros de um job
     */
    async getJobErrors(jobId, pagination) {
        const errors = await models_1.BatchJobErrorModel.findByJobId(jobId, pagination);
        return errors;
    }
    /**
     * Busca estatísticas do sistema
     */
    async getSystemStats() {
        const jobsByStatus = await models_1.BatchJobModel.countByStatus();
        const activeWorkers = this.workerExecutors.size;
        const queueLength = jobsByStatus.pending;
        // Calcular média de duração dos jobs completados recentemente
        const recentJobs = await models_1.BatchJobModel.findAll({ status: 'completed' }, { page: 1, limit: 100 });
        const avgDuration = recentJobs.length > 0
            ? recentJobs.reduce((sum, job) => {
                const start = job.started_at ? new Date(job.started_at).getTime() : 0;
                const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
                return sum + (end - start);
            }, 0) / recentJobs.length
            : 0;
        const totalItems = await (0, conection_1.db)('batch_jobs')
            .sum('processed_rows as total')
            .first()
            .then(r => r.total || 0);
        const totalErrors = await (0, conection_1.db)('batch_job_errors').count('id as count')
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
    async pollAndDispatch() {
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
        const jobRow = await models_1.BatchJobModel.findNextPending(workerId);
        if (!jobRow) {
            return; // Nenhum job pendente
        }
        // Criar executor para este job
        await this.dispatchJob(jobRow, workerId);
    }
    /**
     * Dispatch: inicia execução de um job em um worker
     */
    async dispatchJob(jobRow, workerId) {
        // Verificar se job está registrado
        const jobClass = (0, JobRegistry_1.create)(jobRow.job_name, {
            batchSize: jobRow.batch_size,
            throttleMs: jobRow.throttle_ms
        });
        if (!jobClass) {
            console.error(`[JobManager] Job "${jobRow.job_name}" não encontrado no registry`);
            await models_1.BatchJobModel.fail(Number(jobRow.id));
            return;
        }
        const executor = new BatchExecutor_1.BatchExecutor(workerId);
        // Configurar listeners de eventos
        executor.on('jobCompleted', async (jid, count) => {
            await models_1.BatchJobModel.complete(jid);
            this.executors.delete(jid);
            this.workerExecutors.delete(workerId);
            this.emitEvent({
                type: 'job:completed',
                jobId: jid,
                jobName: jobRow.job_name,
                timestamp: new Date(),
                data: { itemsProcessed: count }
            });
        });
        executor.on('jobFailed', async (jid, error) => {
            await models_1.BatchJobModel.fail(jid);
            this.executors.delete(jid);
            this.workerExecutors.delete(workerId);
            this.emitEvent({
                type: 'job:failed',
                jobId: jid,
                jobName: jobRow.job_name,
                timestamp: new Date(),
                data: { error: error.message }
            });
        });
        executor.on('jobError', async (jid, error, recordId) => {
            await models_1.BatchJobModel.incrementErrorCount(jid);
            this.emitEvent({
                type: 'job:error',
                jobId: jid,
                jobName: jobRow.job_name,
                timestamp: new Date(),
                data: { error: error.message, recordId }
            });
        });
        executor.on('jobPaused', async (jid) => {
            this.executors.delete(jid);
            this.workerExecutors.delete(workerId);
        });
        // Guardar referências
        this.executors.set(Number(jobRow.id), executor);
        this.workerExecutors.set(workerId, executor);
        // Executar job em background (não await)
        executor.run(jobRow, jobClass).catch(err => {
            console.error(`[JobManager] Erro ao executar job ${jobRow.id}:`, err);
        });
        this.emitEvent({
            type: 'job:started',
            jobId: Number(jobRow.id),
            jobName: jobRow.job_name,
            timestamp: new Date()
        });
        await models_1.BatchJobLogModel.create(Number(jobRow.id), 'info', `Job iniciado pelo JobManager (worker=${workerId})`);
    }
    /**
     * Emite evento do sistema (compatível com listener externo)
     */
    emitEvent(event) {
        this.emit('event', event);
        // Emitir também evento específico
        this.emit(event.type, event);
    }
    /**
     * Obtém todos os workers ativos
     */
    getActiveWorkers() {
        return Array.from(this.workerExecutors.keys());
    }
    /**
     * Obtém executors ativos (jobId -> executor)
     */
    getActiveExecutors() {
        return new Map(this.executors);
    }
}
exports.JobManager = JobManager;
JobManager.instance = null;
