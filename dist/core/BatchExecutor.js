"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchExecutor = void 0;
const events_1 = require("events");
const conection_1 = require("../db/conection");
const BatchIterator_1 = require("./BatchIterator");
const models_1 = require("../db/models");
const models_2 = require("../db/models");
class BatchExecutor extends events_1.EventEmitter {
    constructor(workerId) {
        super();
        this.workerId = workerId || `worker-${process.pid}-${Date.now()}`;
    }
    /**
     * Executa um job completo
     */
    async run(jobRow, jobDef) {
        const jobId = jobRow.id;
        const jobName = jobRow.job_name;
        // Anexar jobId ao jobDef para uso nos hooks
        jobDef.jobId = jobId;
        // Estatísticas
        let batchNumber = 0;
        let itemsProcessed = 0;
        let itemsSkipped = 0;
        let itemsFailed = 0;
        const startTime = Date.now();
        // Emitir evento de início
        this.emit('jobStarted', jobId, jobName);
        await models_2.BatchJobLogModel.create(jobId, 'info', `Job iniciado pelo worker ${this.workerId}`);
        try {
            while (true) {
                // A cada iterations, verificar se foi pausado
                // (fazemos isso a cada batch, não a cada item, para performance)
                const freshJob = await (0, conection_1.db)('batch_jobs')
                    .where({ id: jobId })
                    .first();
                if (!freshJob) {
                    throw new Error(`Job ${jobId} não encontrado`);
                }
                if (freshJob.status === 'paused') {
                    this.emit('jobPaused', jobId);
                    await models_2.BatchJobLogModel.create(jobId, 'warn', 'Job pausado');
                    return; // Sai gracefully
                }
                if (freshJob.status === 'cancelled') {
                    await models_2.BatchJobLogModel.create(jobId, 'info', 'Job cancelado');
                    return;
                }
                // Incrementar contador de batch
                batchNumber++;
                // Fetch do próximo lote
                const iterator = new BatchIterator_1.BatchIterator(freshJob, jobDef);
                const records = await iterator.fetchBatch();
                if (records.length === 0) {
                    // Não há mais registros - job completo!
                    break;
                }
                // Processar cada registro do lote
                for (let i = 0; i < records.length; i++) {
                    const record = records[i];
                    // Verificar se deve pular registro (hook shouldSkip)
                    if (await jobDef.shouldSkip(record)) {
                        itemsSkipped++;
                        this.emit('itemSkipped', jobId, record?.id, 'skipped by shouldSkip');
                        continue;
                    }
                    const context = {
                        record,
                        jobId,
                        batchNumber,
                        itemIndex: i
                    };
                    // Chamar hook antes do processamento
                    await jobDef.onBeforeProcess(context);
                    // Executar com retry/timeout
                    const result = await jobDef.executeWithRetry(record, context);
                    if (result.success) {
                        itemsProcessed++;
                        this.emit('itemProcessed', jobId, record?.id);
                    }
                    else {
                        itemsFailed++;
                        this.emit('jobError', jobId, result.error, record?.id);
                    }
                    // Emitir progresso a cada N itens (evitar muitos eventos)
                    if (itemsProcessed % 100 === 0) {
                        this.emit('jobProgress', jobId, itemsProcessed);
                    }
                }
                // Atualizar current_id com o último ID do lote
                const lastRecord = records[records.length - 1];
                const lastId = lastRecord?.id || freshJob.current_id;
                // Checkpoint: salvar progresso no banco
                try {
                    await models_1.BatchJobModel.updateProgress(jobId, lastId, itemsProcessed);
                }
                catch (error) {
                    console.error(`[BatchExecutor] Erro ao salvar checkpoint: ${error}`);
                    // Não falha o job por isso, apenas loga
                }
                // Throttle entre batches (se configurado)
                if (freshJob.throttle_ms > 0) {
                    await new Promise(resolve => setTimeout(resolve, freshJob.throttle_ms));
                }
            }
            // Job completado com sucesso!
            const totalDurationMs = Date.now() - startTime;
            await models_1.BatchJobModel.complete(jobId);
            this.emit('jobCompleted', jobId, itemsProcessed);
            await models_2.BatchJobLogModel.create(jobId, 'info', `Job completado. Processados: ${itemsProcessed}, Pulados: ${itemsSkipped}, Falhas: ${itemsFailed}, Duração: ${totalDurationMs}ms`);
        }
        catch (error) {
            // Erro catastrófico (não por item)
            itemsFailed++;
            this.emit('jobFailed', jobId, error);
            await models_1.BatchJobModel.fail(jobId);
            await models_2.BatchJobLogModel.create(jobId, 'error', `Job falhou com erro: ${error.message}. Stack: ${error.stack || 'N/A'}`);
            throw error; // Repassar para quem chamou run()
        }
    }
    /**
     * Retorna o ID do worker
     */
    getWorkerId() {
        return this.workerId;
    }
}
exports.BatchExecutor = BatchExecutor;
