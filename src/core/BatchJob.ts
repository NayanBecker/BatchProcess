import { BatchJobErrorModel } from '../db/models';
import { LogLevel } from '../types';

/**
 * Configuração de retry
 */
export interface RetryPolicy {
    maxRetries: number;
    backoffMs: number;
    jitterMs?: number;
}

/**
 * Configuração de timeout
 */
export interface TimeoutConfig {
    enabled: boolean;
    perItemMs: number;
}

/**
 * Configuração de checkpoint
 */
export interface CheckpointConfig {
    saveAfterEveryNBatches: number;
    saveEveryNSeconds?: number;
}

/**
 * Configuração completa do job
 */
export interface JobConfig {
    batchSize: number;
    throttleMs: number;
    retryPolicy: RetryPolicy;
    timeout: TimeoutConfig;
    checkpoint: CheckpointConfig;
}

/**
 * Contexto de processamento de um item (passado para hooks)
 */
export interface ProcessItemContext<T> {
    record: T;
    jobId: number;
    batchNumber: number;
    itemIndex: number;
}

/**
 * Classe base abstrata para jobs de batch processing
 *
 * Para criar um novo job, estenda esta classe e implemente:
 * - tableName: nome da tabela de origem
 * - processItem(record): lógica de processamento de cada registro
 *
 * Opcionalmente, override os hooks para customizar comportamento:
 * - onBeforeProcess(context)
 * - onAfterProcess(context, success)
 * - onError(context, error)
 * - shouldSkip(record): retorna true para pular registro
 */
export abstract class BatchJob<T> {
    /**
     * Nome da tabela de origem dos dados
     */
    abstract tableName: string;

    /**
     * ID do job na tabela batch_jobs (preenchido pelo executor)
     */
    jobId?: number;

    /**
     * Configuração do job (pode ser override na subclass)
     */
    config: Required<JobConfig> = {
        batchSize: 1000,
        throttleMs: 500,
        retryPolicy: {
            maxRetries: 3,
            backoffMs: 1000,
            jitterMs: 100
        },
        timeout: {
            enabled: true,
            perItemMs: 30000
        },
        checkpoint: {
            saveAfterEveryNBatches: 1
        }
    };

    /**
     * Validação pré-execução (override para customizar)
     */
    async validate(): Promise<void> {
        // padrão: não faz nada
    }

    /**
     * Processa um registro individual (MUST override)
     */
    abstract processItem(record: T): Promise<void>;

    /**
     * Hook chamado ANTES de processar cada item
     * Pode ser usado para logging, métricas, etc
     */
    async onBeforeProcess(_context: ProcessItemContext<T>): Promise<void> {
        // padrão: não faz nada
    }

    /**
     * Hook chamado DEPOIS de processar cada item com sucesso
     */
    async onAfterProcess(_context: ProcessItemContext<T>): Promise<void> {
        // padrão: não faz nada
    }

    /**
     * Hook chamado quando processItem lança erro
     * Pode ser usado para logging customizado, métricas, etc
     * Retorna true se o erro deve ser registrado (default: true)
     */
    async onError(
        context: ProcessItemContext<T>,
        error: Error,
        retryCount: number
    ): Promise<boolean> {
        // Registrar erro no banco
        await BatchJobErrorModel.create(
            context.jobId,
            error,
            (context.record as any)?.id,
            retryCount
        );
        return true; // registrar erro
    }

    /**
     * Hook para decidir se um registro deve ser pulado
     * Útil para business logic: pular registros já processados, inválidos, etc
     */
    async shouldSkip(_record: T): Promise<boolean> {
        return false; // padrão: não pular
    }

    /**
     * Construtor permite injetar configuração customizada
     */
    constructor(config?: Partial<JobConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
    }

    /**
     * Builder de query para buscar próximo lote de registros
     * Pode ser override para queries complexas (joins, conditions extras)
     */
    queryBuilder(lastId: number, batchSize: number): string {
        return `SELECT * FROM ${this.tableName}
                WHERE id > ${lastId}
                ORDER BY id ASC LIMIT ${batchSize}`;
    }

    /**
     * Método interno: executa processItem com retry, timeout e error handling
     * NÃO chamar diretamente - usado pelo BatchExecutor
     */
    async executeWithRetry(
        record: T,
        context: Omit<ProcessItemContext<T>, 'record'> & { record: T }
    ): Promise<{ success: boolean; error?: Error }> {
        const { retryPolicy, timeout } = this.config;
        const recordId = (record as any)?.id;

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
            try {
                // Executar com timeout se habilitado
                if (timeout.enabled) {
                    await Promise.race([
                        this.processItem(record),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Timeout after ${timeout.perItemMs}ms`)), timeout.perItemMs)
                        )
                    ]);
                } else {
                    await this.processItem(record);
                }

                // Sucesso!
                await this.onAfterProcess(context);
                return { success: true };
            } catch (error: any) {
                lastError = error;

                if (attempt < retryPolicy.maxRetries) {
                    // Calcular backoff com jitter
                    const backoffMs = retryPolicy.backoffMs * Math.pow(2, attempt);
                    const jitter = retryPolicy.jitterMs
                        ? Math.random() * retryPolicy.jitterMs
                        : 0;
                    const delayMs = backoffMs + jitter;

                    await this.onError(context, error, attempt + 1);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                // Senão, sai do loop e retorna erro
            }
        }

        // Todas as tentativas falharam
        if (lastError) {
            await this.onError(context, lastError, retryPolicy.maxRetries + 1);
        }

        return { success: false, error: lastError };
    }
}
