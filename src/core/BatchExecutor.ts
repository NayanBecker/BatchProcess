import { BatchObservability } from '../types';
const emptyObservation = (): BatchObservability => ({version:1,attempts:0,failures:0,samples:0,visited:'0',changed:'0',inserted:'0',deleted:'0',workSeconds:0,cpuSeconds:0,rssSampleMaxBytes:0});
import { assertAdmissionAllowed } from './admission';
import { guardTransactionalConnection, withTransactionalOwnership, assertDurableTarget } from './TransactionalOwnership';
import { EventEmitter } from 'events';
import { transitionTiming } from './jobTiming';
import { randomUUID } from 'crypto';
import { TransactionalBatchJob, TransactionalState, decimalId } from './TransactionalBatchJob';
import { PersistenceContext } from '../db/models/BatchJobModel';
import { BatchIterator } from './BatchIterator';
export class BatchExecutor extends EventEmitter {
    private workerId: string;
    private pauseRequested = false;
    requestPause(): void { this.pauseRequested = true; }
    constructor(workerId?: string, private persistence?: PersistenceContext) {
        super(); this.workerId = workerId || `worker-${process.pid}-${Date.now()}`;
    }
    async run(row: any, job: TransactionalBatchJob): Promise<void> {
        if (!(job instanceof TransactionalBatchJob)) throw new Error('Caminho legado arquivado; job transacional obrigatório');
        return this.runTransactional(row, job);
    }
    private async runTransactional(jobRow: any, job: TransactionalBatchJob): Promise<void> {
        const context = this.persistence;
        if (!context) throw new Error('Contexto experimental explícito obrigatório');
        await job.validate();
        return withTransactionalOwnership(context, jobRow.id, async connection => {
        const owner = randomUUID();
        const jobs = () => context.db('batch_jobs').withSchema(context.schema).connection(connection);
        const acquired = await context.db.transaction<number>(async trx => {
            await guardTransactionalConnection(trx, context);
            const pending = await trx('batch_jobs').withSchema(context.schema).where({id:jobRow.id,status:'pending'}).forUpdate().first();
            if (!pending?.transactional_state) return 0;
            assertDurableTarget(pending.transactional_state,context);
            assertAdmissionAllowed(context.admissionSignal); // session + row locks held before acquisition
            const timing = transitionTiming(pending.transactional_state.timing,'active',Date.now());
            const acquiredRows = await trx('batch_jobs').withSchema(context.schema).where({id: jobRow.id, status: 'pending'})
                .whereNotNull('transactional_state').update({status: 'running', worker_id: owner,
                    started_at: trx.raw('COALESCE(started_at, CURRENT_TIMESTAMP)'),
                    transactional_state: {...pending.transactional_state,ownershipProtocol:'session-affine-v1',timing}
                }).returning('id');
            return acquiredRows.length;
        }, {connection});
        if (acquired !== 1) throw new Error('Job não está pendente; recuperação automática proibida');
        const audit = async (status: string) => {
            try { await context.db.transaction(async trx => {
                await guardTransactionalConnection(trx,context);
                if (await trx.schema.withSchema(context.schema).hasTable('batch_job_logs')) await trx('batch_job_logs').withSchema(context.schema).insert({job_id:jobRow.id,level:status==='failed'?'error':'info',message:status,metadata:{operation:jobRow.transactional_state.operation}});
            },{connection}); } catch { /* auxiliary audit never replays committed domain work */ }
        };
        await audit('running');
        let admitted = false;
        try {
            while (true) {
                // Durable admission survives rollback; interruption leaves an unresolved attempt.
                admitted = await context.db.transaction(async trx => {
                    await guardTransactionalConnection(trx,context);
                    const r = await trx('batch_jobs').withSchema(context.schema).where({id:jobRow.id}).forUpdate().first();
                    if (r.status !== 'running' || r.worker_id !== owner) throw new Error('Posse perdida');
                    if (r.transactional_state.controlRequest || this.pauseRequested) return false;
                    const m = r.transactional_state.observability || emptyObservation();
                    if (!Number.isSafeInteger(m.attempts+1)) throw new Error('Limite de tentativas observáveis excedido');
                    await trx('batch_job_logs').withSchema(context.schema).insert({job_id:jobRow.id,level:'info',message:'batch_admitted_v1',metadata:{version:1,attempt:m.attempts+1}});
                    await trx('batch_jobs').withSchema(context.schema).where({id:jobRow.id}).update({transactional_state:{...r.transactional_state,observability:{...m,attempts:m.attempts+1}}});
                    return true;
                },{connection});
                const transactionStart = process.hrtime.bigint();
                const committed = await context.db.transaction(async trx => {
                    const workStart = process.hrtime.bigint();
                    const cpuStart = process.cpuUsage();
                    const rssStart = process.memoryUsage().rss;
                    await guardTransactionalConnection(trx, context);
                    const current = await trx('batch_jobs').withSchema(context.schema).where({id: jobRow.id}).forUpdate().first();
                    if (current.status !== 'running' || current.worker_id !== owner) throw new Error('Posse perdida');
                    const request = current.transactional_state.controlRequest || (this.pauseRequested ? 'pause' : undefined);
                    if (request) {
                        await trx('batch_jobs').withSchema(context.schema).where({id: jobRow.id, worker_id: owner}).update({
                            status: request === 'cancel' ? 'cancelled' : 'paused', worker_id: null, updated_at: new Date(),
                            completed_at: request === 'cancel' ? new Date() : null,
                            transactional_state: {...current.transactional_state,timing:transitionTiming(current.transactional_state.timing,request==='cancel'?'terminal':'paused',Date.now())}
                        });
                        return {state: current.transactional_state as TransactionalState, final: true, throttle: 0, stopped: true};
                    }
                    const state: TransactionalState = current.transactional_state;
                    assertDurableTarget(state,context);
                    await trx.raw("SELECT set_config('statement_timeout', ?, true), set_config('lock_timeout', ?, true)",
                        [String(state.statementTimeoutMs ?? 0), String(state.lockTimeoutMs ?? 0)]);
                    const config = current.effective_config;
                    job.config = config; job.validateConfig();
                    const boundary = state.mode === 'A'
                        ? {hi: state.highWater, visited: String((await trx(state.table).withSchema(context.dataSchema ?? context.schema).where('id','>',state.cursor).where('id','<=',state.highWater).modify(q => { if (state.eligibleOnly) q.where({migrado:true}); }).count('* as n').first()).n), final: true}
                        : await BatchIterator.boundary(trx, {schema: context.dataSchema ?? context.schema, table: state.table, eligibleOnly: state.eligibleOnly}, state.cursor, state.highWater, config.batchSize);
                    const counts = boundary.visited === '0' ? {changed:'0',inserted:'0',deleted:'0'} : await job.executeBatch({
                        trx, schema: context.dataSchema ?? context.schema, table: state.table, lo: state.cursor, hi: boundary.hi,
                        highWater: state.highWater, jobId: jobRow.id, config
                    });
                    const workSeconds = Number(process.hrtime.bigint()-workStart)/1e9;
                    const cpu = process.cpuUsage(cpuStart);
                    const cpuSeconds = (cpu.user+cpu.system)/1e6;
                    const rssSampleMaxBytes = Math.max(rssStart,process.memoryUsage().rss);
                    const old = state.observability || emptyObservation();
                    const observation: BatchObservability = {...old,samples:old.samples+1,lastCommittedAttempt:old.attempts,
                        workSeconds:old.workSeconds+workSeconds,cpuSeconds:old.cpuSeconds+cpuSeconds,
                        rssSampleMaxBytes:Math.max(old.rssSampleMaxBytes,rssSampleMaxBytes),
                        visited:String(BigInt(old.visited)+BigInt(boundary.visited)),
                        changed:String(BigInt(old.changed)+BigInt(decimalId(counts.changed))),
                        inserted:String(BigInt(old.inserted)+BigInt(decimalId(counts.inserted))),
                        deleted:String(BigInt(old.deleted)+BigInt(decimalId(counts.deleted)))};
                    // This event is in the SAME transaction as domain DML and checkpoint.
                    await trx('batch_job_logs').withSchema(context.schema).insert({job_id:jobRow.id,level:'info',message:'batch_committed_v1',metadata:{
                        version:1,attempt:old.attempts,sequence:observation.samples,operation:state.operation,mode:state.mode,
                        visited:boundary.visited,changed:decimalId(counts.changed),inserted:decimalId(counts.inserted),deleted:decimalId(counts.deleted),workSeconds,cpuSeconds,rssSampleMaxBytes,
                        durationScope:'transaction-entry-through-dml-before-checkpoint'}});
                    const next: TransactionalState = {...state, observability:observation, timing:transitionTiming(state.timing,boundary.final?'terminal':'active',Date.now()), cursor: boundary.hi,
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
                if ('stopped' in committed) { await audit(committed.state.controlRequest==='cancel'?'cancelled':'paused'); return; }
                admitted = false;
                const transactionRoundTripSeconds = Number(process.hrtime.bigint()-transactionStart)/1e9;
                // Full round-trip includes BEGIN/checkpoint/COMMIT; best effort, not atomic with commit.
                try { await context.db.transaction(async trx => {
                    await guardTransactionalConnection(trx,context);
                    await trx('batch_job_logs').withSchema(context.schema).insert({job_id:jobRow.id,level:'info',message:'batch_confirmed_v1',metadata:{sequence:committed.state.observability?.samples,transactionRoundTripSeconds,durationScope:'before-transaction-call-through-commit-ack'}});
                },{connection}); } catch { /* committed work must not be replayed */ }
                await audit(committed.final?'completed':'checkpoint');
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
                const failed = await jobs().where({id:jobRow.id,worker_id:owner,status:'running'}).first();
                if (failed) await jobs().where({id:jobRow.id,worker_id:owner,status:'running'}).update({status:'failed',updated_at:new Date(),error_count:failed.error_count+1,
                    transactional_state:{...failed.transactional_state,...(admitted && failed.transactional_state.observability?.lastCommittedAttempt !== failed.transactional_state.observability?.attempts ? {observability:{...(failed.transactional_state.observability || emptyObservation()),failures:(failed.transactional_state.observability?.failures || 0)+1}} : {}),timing:transitionTiming(failed.transactional_state.timing,'terminal',Date.now())}});
                if (failed) {
                    await context.db.transaction(async trx=>{
                        await guardTransactionalConnection(trx,context);
                        if (await trx.schema.withSchema(context.schema).hasTable('batch_job_errors')) await trx('batch_job_errors').withSchema(context.schema).insert({job_id:jobRow.id,error_message:'Transactional execution failed; inspect controlled worker error',retry_count:0});
                    },{connection});
                    await audit('failed');
                }
            } catch { /* connection lost; explicit reconciliation only, audit may be incomplete */ }
            throw error;
        }
        });
    }

    getWorkerId(): string {
        return this.workerId;
    }
}
