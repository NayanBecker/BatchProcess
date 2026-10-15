/**
 * Tipos compartilhados do Batch Framework
 */

/**
 * Status possíveis de um job
 */
/** Retained telemetry v1; attempts are durable admissions, not inferred retries.
 * Duration is monotonic transaction callback entry through DML, BEFORE checkpoint/COMMIT.
 * CPU belongs to this Node process (not SQL); RSS max is boundary samples, not exact peak.
 */
export interface BatchObservability {
    version: 1; attempts: number; failures: number; samples: number; lastCommittedAttempt?: number;
    visited: string; changed: string; inserted: string; deleted: string;
    workSeconds: number; cpuSeconds: number; rssSampleMaxBytes: number;
}

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

/**
 * Nível de log
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Política de retry
 */
export interface RetryPolicy {
    maxRetries: number;
    backoffMs: number; // multiplicador (ex: 1000 = 1s, 2s, 4s...)
    jitterMs?: number; // aleatoriedade adicional
}

/**
 * Configuração de timeout
 */
export interface TimeoutConfig {
    enabled: boolean;
    perItemMs: number; // timeout por item
    totalMs?: number; // timeout total do job
}

/**
 * Política de checkpoint (quando salvar progresso)
 */
export interface CheckpointPolicy {
    saveAfterEveryNBatches: number; // 1 = a cada batch
    saveEveryNSeconds?: number; // heartbeat
}

/**
 * Configuração completa de um job
 */
export interface JobConfig {
    batchSize: number;
    throttleMs: number;
    retryPolicy: RetryPolicy;
    timeout: TimeoutConfig;
    checkpoint: CheckpointPolicy;
    priority: number;
    tags: string[];
}

/**
 * Métricas de execução de um job
 */
export interface JobMetrics {
    activeDurationMs: number; pausedDurationMs: number; wallDurationMs: number; timingUncertain: boolean;
    itemsProcessed: number | string;
    itemsPerSecond: number | null;
    errorsCount: number;
    retriesCount: number;
    totalDurationMs: number;
    /** Legacy compatibility field, not observed item latency. Null for transactional jobs. */
    avgItemDurationMs: number | null;
    lastBatchAt?: Date;
}

/**
 * Entrada na tabela batch_jobs
 */
export interface BatchJobRow {
    effective_config?: JobConfig;
    transactional_state?: import('../core/TransactionalBatchJob').TransactionalState;
    id: number;
    job_name: string;
    status: JobStatus;
    batch_size: number;
    current_id: number | string;
    processed_rows: number | string;
    throttle_ms: number;
    priority: number;
    tags: string[];
    scheduled_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;
    error_count: number;
    worker_id: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Entrada na tabela batch_job_errors
 */
export interface BatchJobErrorRow {
    id: number;
    job_id: number;
    error_message: string;
    error_stack: string | null;
    record_id: number | null;
    retry_count: number;
    last_retry_at: Date | null;
    created_at: Date;
}

/**
 * Entrada na tabela batch_job_logs
 */
export interface BatchJobLogRow {
    id: number;
    job_id: number;
    level: LogLevel;
    message: string;
    metadata: Record<string, any> | null;
    created_at: Date;
}

/**
 * Evento do sistema (para emissão via EventEmitter)
 */
export type JobEventType =
    | 'job:queued'
    | 'job:started'
    | 'job:progress'
    | 'job:item_processed'
    | 'job:item_skipped'
    | 'job:error'
    | 'job:retry'
    | 'job:completed'
    | 'job:failed'
    | 'job:paused'
    | 'job:resumed';

export interface JobEvent<T = any> {
    type: JobEventType;
    jobId: number;
    jobName: string;
    timestamp: Date;
    data?: T;
}

/**
 * DTO de job para uso interno e na CLI
 */
export interface JobDTO {
    transactionalState?: import('../core/TransactionalBatchJob').TransactionalState;
    id: number;
    job_name: string;
    status: JobStatus;
    config: Required<JobConfig>;
    metrics: JobMetrics;
    tags: string[];
    priority: number;
    scheduled_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;
    error_count: number;
    worker_id: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Estatísticas do sistema
 */
export interface SystemStats {
    totalJobs: number;
    jobsByStatus: Record<JobStatus, number>;
    activeWorkers: number;
    queueLength: number;
    avgJobDurationMs: number;
    totalItemsProcessed: number;
    totalErrors: number;
}

/**
 * Configuração da conexão do banco
 */
export interface DatabaseConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    poolMin?: number;
    poolMax?: number;
}

