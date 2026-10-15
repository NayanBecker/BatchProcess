import { resolveJobConfig, JobConfigInput, validateSqlTimeouts } from './jobConfig';
import { TransactionalBatchJob, TransactionalSpec } from './TransactionalBatchJob';
import { PersistenceContext, BatchJobModel } from '../db/models/BatchJobModel';
import { EventEmitter } from 'events';
import { BatchExecutor } from './BatchExecutor';
import { create as createJobInstance } from './JobRegistry';
export interface JobManagerConfig { maxConcurrentJobs: number; pollIntervalMs?: number; defaultJobConfig?: JobConfigInput; }
/** Shared manager: only explicit transactional dispatch is active. */
export class JobManager extends EventEmitter {
    private static instance: JobManager | null = null;
    private executors = new Map<number, BatchExecutor>();
    private workerExecutors = new Map<string, BatchExecutor>();
    private transactionalBusy = false;
    private stopping = false;
    private activeRuns = new Set<Promise<unknown>>();
    private constructor(private config: JobManagerConfig) {
        super();
        if (!Number.isSafeInteger(config.maxConcurrentJobs) || config.maxConcurrentJobs < 1) throw new Error('concorrência inválida');
    }
    static getInstance(config?: JobManagerConfig): JobManager {
        if (!this.instance) {
            if (!config) throw new Error('JobManager não inicializado');
            this.instance = new JobManager(config);
        }
        return this.instance;
    }
    private track<T>(run: Promise<T>): Promise<T> {
        this.activeRuns.add(run);
        void run.finally(() => this.activeRuns.delete(run)).catch(() => {});
        return run;
    }
    async start(): Promise<void> {
        if (this.transactionalBusy) throw new Error('Worker experimental exige exclusividade local');
        throw new Error('Polling legado arquivado; use dispatch explícito');
    }
    async stop(): Promise<void> {
        this.stopping = true;
        try {
            for (const executor of this.workerExecutors.values()) executor.requestPause();
            await Promise.allSettled([...this.activeRuns]);
        } finally { this.stopping = false; }
    }
    runTransactional(name: string, context: PersistenceContext, spec: TransactionalSpec, options: JobConfigInput = {}) {
        return this.track(this.executeTransactional(name, context, spec, options));
    }

    private async executeTransactional(name: string, context: PersistenceContext, spec: TransactionalSpec, options: JobConfigInput) {
        if (this.stopping) throw new Error('Shutdown em andamento');
        if (this.transactionalBusy || this.executors.size) throw new Error('Worker experimental exige exclusividade local');
        this.transactionalBusy = true; // reserve synchronously, before any await
        const worker = `transactional-${process.pid}`;
        try {
            const job = createJobInstance(name);
            if (!(job instanceof TransactionalBatchJob)) throw new Error('Job transacional não registrado');
            job.config = resolveJobConfig(job.config, this.config.defaultJobConfig ?? {}, options);
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
        if (this.transactionalBusy || this.executors.size) throw new Error('Worker experimental exige exclusividade local');
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
