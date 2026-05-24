"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchJob = void 0;
const models_1 = require("../db/models");
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
class BatchJob {
    /**
     * Validação pré-execução (override para customizar)
     */
    async validate() {
        // padrão: não faz nada
    }
    /**
     * Hook chamado ANTES de processar cada item
     * Pode ser usado para logging, métricas, etc
     */
    async onBeforeProcess(_context) {
        // padrão: não faz nada
    }
    /**
     * Hook chamado DEPOIS de processar cada item com sucesso
     */
    async onAfterProcess(_context) {
        // padrão: não faz nada
    }
    /**
     * Hook chamado quando processItem lança erro
     * Pode ser usado para logging customizado, métricas, etc
     * Retorna true se o erro deve ser registrado (default: true)
     */
    async onError(context, error, retryCount) {
        // Registrar erro no banco
        await models_1.BatchJobErrorModel.create(context.jobId, error, context.record?.id, retryCount);
        return true; // registrar erro
    }
    /**
     * Hook para decidir se um registro deve ser pulado
     * Útil para business logic: pular registros já processados, inválidos, etc
     */
    async shouldSkip(_record) {
        return false; // padrão: não pular
    }
    /**
     * Construtor permite injetar configuração customizada
     */
    constructor(config) {
        /**
         * Configuração do job (pode ser override na subclass)
         */
        this.config = {
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
        if (config) {
            this.config = { ...this.config, ...config };
        }
    }
    /**
     * Builder de query para buscar próximo lote de registros
     * Pode ser override para queries complexas (joins, conditions extras)
     */
    queryBuilder(lastId, batchSize) {
        return `SELECT * FROM ${this.tableName}
                WHERE id > ${lastId}
                ORDER BY id ASC LIMIT ${batchSize}`;
    }
    /**
     * Método interno: executa processItem com retry, timeout e error handling
     * NÃO chamar diretamente - usado pelo BatchExecutor
     */
    async executeWithRetry(record, context) {
        const { retryPolicy, timeout } = this.config;
        const recordId = record?.id;
        let lastError = null;
        for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
            try {
                // Executar com timeout se habilitado
                if (timeout.enabled) {
                    await Promise.race([
                        this.processItem(record),
                        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeout.perItemMs}ms`)), timeout.perItemMs))
                    ]);
                }
                else {
                    await this.processItem(record);
                }
                // Sucesso!
                await this.onAfterProcess(context);
                return { success: true };
            }
            catch (error) {
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
exports.BatchJob = BatchJob;
