import { Knex } from 'knex';
import { JobConfig } from '../types';
import { resolveJobConfig, JobConfigInput } from './jobConfig';

export function decimalId(value: unknown): string {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > 9223372036854775807n) {
        throw new Error('ID deve ser decimal BIGINT não negativo sem perda');
    }
    return value;
}
export interface TransactionalContext {
    trx: Knex.Transaction;
    schema: string;
    table: string;
    lo: string;
    hi: string;
    highWater: string;
    jobId: number;
    config: JobConfig;
}
export interface DmlCounts { changed: string; inserted: string; deleted: string; }
export interface TransactionalSpec {
    table: string; mode: 'A' | 'B'; protocol: string; dataset: string; operation: string;
    statementTimeoutMs?: number; lockTimeoutMs?: number; eligibleOnly?: boolean;
}
export interface TransactionalState extends TransactionalSpec, DmlCounts {
    highWater: string; cursor: string; visited: string; commits: string;
    observability?: import('../types').BatchObservability;
    target?: {database: string; controlSchema: string; dataSchema: string};
    timing?: import('./jobTiming').JobTiming;
    ownershipProtocol?: 'session-affine-v1';
    controlRequest?: 'pause' | 'cancel' | null;
}

/** Set-based only. Never receives the global connection or item retry wrapper. */
export abstract class TransactionalBatchJob {
    readonly kind = 'transactional' as const;
    config: JobConfig;
    constructor(config: JobConfigInput = {}) {
        this.config = resolveJobConfig({ throttleMs: 0, retryPolicy: { maxRetries: 0 }, timeout: { enabled: false } }, config);
        this.validateConfig();
    }
    validateConfig(): void {
        if (this.config.timeout.enabled) throw new Error('Timeout por item não suportado; use statementTimeoutMs no experimento');
        if (this.config.timeout.totalMs !== undefined) throw new Error('Orçamento total ainda não suportado');
        if (this.config.retryPolicy.maxRetries !== 0) throw new Error('retry automático não suportado');
        if (this.config.checkpoint.saveAfterEveryNBatches !== 1 || this.config.checkpoint.saveEveryNSeconds !== undefined) throw new Error('checkpoint obrigatório por commit');
    }
    async validate(): Promise<void> { this.validateConfig(); }
    validateInitial?: (trx: Knex.Transaction, schema: string, table: string) => Promise<void>;
    abstract executeBatch(context: TransactionalContext): Promise<DmlCounts>;
}
