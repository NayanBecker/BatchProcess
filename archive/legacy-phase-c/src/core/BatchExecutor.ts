import { guardTransactionalConnection, withTransactionalOwnership } from './TransactionalOwnership';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { TransactionalBatchJob, TransactionalState, decimalId } from './TransactionalBatchJob';
import { PersistenceContext } from '../db/models/BatchJobModel';
import { db } from "../db/conection";
import { BatchIterator } from "./BatchIterator";
import { BatchJob } from "./BatchJob";
import { BatchJobModel } from "../db/models";
import { BatchJobLogModel } from "../db/models";
import { JobEvent, JobEventType } from "../types";
import type { ProcessItemContext } from "./BatchJob";

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
    private pauseRequested = false;

    requestPause(): void { this.pauseRequested = true; }

    constructor(workerId?: string, private persistence?: PersistenceContext) {
        super();
        this.workerId = workerId || `worker-${process.pid}-${Date.now()}`;
    }

    /**
     * Executa um job completo
     */
    async run(jobRow: any, jobDef: BatchJob<any> | TransactionalBatchJob): Promise<void> {
        if (jobDef instanceof TransactionalBatchJob) return this.runTransactional(jobRow, jobDef);
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
                if (this.pauseRequested) {
                    const paused = await BatchJobModel.pause(jobId);
                    if (paused?.status === 'paused') this.emit('jobPaused', jobId);
                    return;
                }
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

                if (freshJob.status === 'completed' || freshJob.status === 'failed') return;

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
    private async runTransactional(jobRow: any, job: TransactionalBatchJob): Promise<void> {
        const context = this.persistence;
        if (!context || !/^phase_c_test_[a-f0-9]{32}$/.test(context.schema)) throw new Error('Contexto experimental explícito obrigatório');
        await job.validate();
        return withTransactionalOwnership(context, jobRow.id, async connection => {
        const owner = randomUUID();
        const jobs = () => context.db('batch_jobs').withSchema(context.schema).connection(connection);
        const acquired = await context.db.transaction<number>(async trx => {
            const { rows } = await trx.raw('SELECT current_database() AS database');
            if (rows[0].database !== 'tcc_framework_test') throw new Error('Destino permitido: tcc_framework_test');
            const acquiredRows = await trx('batch_jobs').withSchema(context.schema).where({id: jobRow.id, status: 'pending'})
                .whereNotNull('transactional_state').update({status: 'running', worker_id: owner,
                    started_at: trx.raw('COALESCE(started_at, CURRENT_TIMESTAMP)'),
                    transactional_state: trx.raw("transactional_state || ?::jsonb", [JSON.stringify({ownershipProtocol:'session-affine-v1'})])
                }).returning('id');
            return acquiredRows.length;
        }, {connection});
        if (acquired !== 1) throw new Error('Job não está pendente; recuperação automática proibida');
        try {
            while (true) {
                const committed = await context.db.transaction(async trx => {
                    await guardTransactionalConnection(trx, context.schema);
                    const current = await trx('batch_jobs').withSchema(context.schema).where({id: jobRow.id}).forUpdate().first();
                    if (current.status !== 'running' || current.worker_id !== owner) throw new Error('Posse perdida');
                    const request = current.transactional_state.controlRequest || (this.pauseRequested ? 'pause' : undefined);
                    if (request) {
                        await trx('batch_jobs').withSchema(context.schema).where({id: jobRow.id, worker_id: owner}).update({
                            status: request === 'cancel' ? 'cancelled' : 'paused', worker_id: null, updated_at: new Date()
                        });
                        return {state: current.transactional_state as TransactionalState, final: true, throttle: 0, stopped: true};
                    }
                    const state: TransactionalState = current.transactional_state;
                    await trx.raw("SELECT set_config('statement_timeout', ?, true), set_config('lock_timeout', ?, true)",
                        [String(state.statementTimeoutMs ?? 0), String(state.lockTimeoutMs ?? 0)]);
                    const config = current.effective_config;
                    job.config = config; job.validateConfig();
                    const boundary = state.mode === 'A'
                        ? {hi: state.highWater, visited: String((await trx(state.table).withSchema(context.schema).where('id','>',state.cursor).where('id','<=',state.highWater).count('* as n').first()).n), final: true}
                        : await BatchIterator.boundary(trx, {schema: context.schema, table: state.table}, state.cursor, state.highWater, config.batchSize);
                    const counts = boundary.visited === '0' ? {changed:'0',inserted:'0',deleted:'0'} : await job.executeBatch({
                        trx, schema: context.schema, table: state.table, lo: state.cursor, hi: boundary.hi,
                        highWater: state.highWater, jobId: jobRow.id, config
                    });
                    const next: TransactionalState = {...state, cursor: boundary.hi,
                        visited: String(BigInt(state.visited) + BigInt(boundary.visited)), commits: String(BigInt(state.commits) + 1n),
                        changed: String(BigInt(state.changed) + BigInt(decimalId(counts.changed))),
                        inserted: String(BigInt(state.inserted) + BigInt(decimalId(counts.inserted))),
                        deleted: String(BigInt(state.deleted) + BigInt(decimalId(counts.deleted)))};
                    await trx('batch_jobs').withSchema(context.schema).where({id: jobRow.id, worker_id: owner}).update({
                        current_id: next.cursor, processed_rows: next.visited, transactional_state: next,
                        status: boundary.final ? 'completed' : 'running', updated_at: new Date(),
                        completed_at: boundary.final ? new Date() : null
                    });
                    return {state: next, final: boundary.final, throttle: config.throttleMs};
                }, {connection});
                if ('stopped' in committed) return;
                // Observer errors are never interpreted as transaction failures. Await then isolate each listener.
                for (const listener of this.rawListeners('transactionalProgress')) {
                    try { await listener.call(this, committed.state); } catch { /* notification only */ }
                }
                if (committed.final) return;
                if (committed.throttle > 0) await new Promise(resolve => setTimeout(resolve, committed.throttle));
            }
        } catch (error) {
            // No retry: reload durable state before any explicit future recovery.
            // Never acquire a replacement connection after an uncertain commit.
            try {
                await jobs().where({id: jobRow.id, worker_id: owner, status: 'running'}).update({status:'failed', updated_at:new Date()});
            } catch { /* connection lost; explicit reconciliation only */ }
            throw error;
        }
        });
    }

    getWorkerId(): string {
        return this.workerId;
    }
}
