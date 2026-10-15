import { JobConfig } from '../types';

export function validateBatchSize(value: number): void {
    // Boundary queries fetch one extra ID to detect the final batch.
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483646) throw new Error('batchSize inválido');
}

export function validateThrottleMs(value: number): void {
    // Node setTimeout coerces larger delays to 1 ms. Never persist that overflow.
    if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error('throttleMs inválido');
}

export function validateSqlTimeouts(spec: {statementTimeoutMs?: number; lockTimeoutMs?: number}): void {
    for (const value of [spec.statementTimeoutMs, spec.lockTimeoutMs]) {
        if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) throw new Error('Timeout de statement/lock inválido');
    }
}

export type JobConfigInput = Partial<Omit<JobConfig, 'retryPolicy' | 'timeout' | 'checkpoint'>> & {
    retryPolicy?: Partial<JobConfig['retryPolicy']>;
    timeout?: Partial<JobConfig['timeout']>;
    checkpoint?: Partial<JobConfig['checkpoint']>;
};

export function resolveJobConfig(...layers: JobConfigInput[]): JobConfig {
    let result: JobConfig = {
        batchSize: 1000, throttleMs: 500, priority: 0, tags: [],
        retryPolicy: { maxRetries: 3, backoffMs: 1000, jitterMs: 100 },
        timeout: { enabled: true, perItemMs: 30000 },
        checkpoint: { saveAfterEveryNBatches: 1 }
    };
    for (const layer of layers) {
        result = { ...result, ...layer,
            retryPolicy: { ...result.retryPolicy, ...layer.retryPolicy },
            timeout: { ...result.timeout, ...layer.timeout },
            checkpoint: { ...result.checkpoint, ...layer.checkpoint }
        };
    }
    validateBatchSize(result.batchSize);
    validateThrottleMs(result.throttleMs);
    for (const [key, value, min] of [
        ['throttleMs', result.throttleMs, 0],
        ['maxRetries', result.retryPolicy.maxRetries, 0], ['backoffMs', result.retryPolicy.backoffMs, 0],
        ['jitterMs', result.retryPolicy.jitterMs ?? 0, 0],
        ['perItemMs', result.timeout.perItemMs, 1],
        ['saveAfterEveryNBatches', result.checkpoint.saveAfterEveryNBatches, 1]
    ] as const) {
        if (!Number.isSafeInteger(value) || value < min) throw new Error(`${key} inválido`);
    }
    result.tags = [...result.tags];
    return result;
}
