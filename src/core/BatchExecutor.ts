import { EventEmitter } from 'events';
import { db } from "../db/conection";
import { BatchIterator } from "./BatchIterator";
import { BatchJob } from "./BatchJob";
import { BatchJobModel } from "../db/models";
import { BatchJobLogModel } from "../db/models";
import { JobEvent, JobEventType, ProcessItemContext } from "../types";

/**
 * Eventos emitidos durante a execução de um job
 */
export interface BatchExecutorEvents {
    jobStarted: (jobId: number, jobName: string) => void;
    jobProgress: (jobId: number, processed: number, total?: number) => void;
    itemProcessed: (jobId: number, recordId?: number) => void;
    itemSkipped: (jobId: number, recordId?: number, reason?: string) => void;
    jobError: (jobId: number, error: Error, recordId?: number, retryCount?: number) => void;
    jobCompleted: (jobId: number, finalCount: number) => void;
    jobFailed: (jobId: number, error: Error) => void;
    jobPaused: (jobId: number) => void;
}

export class BatchExecutor extends EventEmitter {
    private workerId: string;

    constructor(workerId?: string) {
        super();
        this.workerId = workerId || `worker-${process.pid}-${Date.now()}`;
    }

    /**
     * Executa um job completo
     */
    async run(jobRow: any, jobDef: BatchJob<any>): Promise<void> {
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
        await BatchJobLogModel.create(jobId, 'info', `Job iniciado pelo worker ${this.workerId}`);

        try {
            while (true) {
                // A cada iterations, verificar se foi pausado
                // (fazemos isso a cada batch, não a cada item, para performance)
                const freshJob = await db('batch_jobs')
                    .where({ id: jobId })
                    .first();

                if (!freshJob) {
                    throw new Error(`Job ${jobId} não encontrado`);
                }

                if (freshJob.status === 'paused') {
                    this.emit('jobPaused', jobId);
                    await BatchJobLogModel.create(jobId, 'warn', 'Job pausado');
                    return; // Sai gracefully
                }

                if (freshJob.status === 'cancelled') {
                    await BatchJobLogModel.create(jobId, 'info', 'Job cancelado');
                    return;
                }

                // Incrementar contador de batch
                batchNumber++;

                // Fetch do próximo lote
                const iterator = new BatchIterator(freshJob, jobDef);
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
                        this.emit('itemSkipped', jobId, (record as any)?.id, 'skipped by shouldSkip');
                        continue;
                    }

                    const context: ProcessItemContext<any> = {
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
                        this.emit('itemProcessed', jobId, (record as any)?.id);
                    } else {
                        itemsFailed++;
                        this.emit('jobError', jobId, result.error!, (record as any)?.id);
                    }

                    // Emitir progresso a cada N itens (evitar muitos eventos)
                    if (itemsProcessed % 100 === 0) {
                        this.emit('jobProgress', jobId, itemsProcessed);
                    }
                }

                // Atualizar current_id com o último ID do lote
                const lastRecord = records[records.length - 1] as any;
                const lastId = lastRecord?.id || freshJob.current_id;

                // Checkpoint: salvar progresso no banco
                try {
                    await BatchJobModel.updateProgress(jobId, lastId, itemsProcessed);
                } catch (error) {
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
            await BatchJobModel.complete(jobId);

            this.emit('jobCompleted', jobId, itemsProcessed);
            await BatchJobLogModel.create(jobId, 'info',
                `Job completado. Processados: ${itemsProcessed}, Pulados: ${itemsSkipped}, Falhas: ${itemsFailed}, Duração: ${totalDurationMs}ms`
            );

        } catch (error: any) {
            // Erro catastrófico (não por item)
            itemsFailed++;
            this.emit('jobFailed', jobId, error);
            await BatchJobModel.fail(jobId);
            await BatchJobLogModel.create(jobId, 'error',
                `Job falhou com erro: ${error.message}. Stack: ${error.stack || 'N/A'}`
            );
            throw error; // Repassar para quem chamou run()
        }
    }

    /**
     * Retorna o ID do worker
     */
    getWorkerId(): string {
        return this.workerId;
    }
}
