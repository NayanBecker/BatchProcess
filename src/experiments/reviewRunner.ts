import { assertAdmissionAllowed } from '../core/admission';
import { Knex } from 'knex';
import { createHash } from 'crypto';
import { PersistenceContext, BatchJobModel } from '../db/models/BatchJobModel';
import { guardTransactionalConnection, validatePersistenceContext, assertDurableTarget } from '../core/TransactionalOwnership';
import { TransactionalBatchJob } from '../core/TransactionalBatchJob';
import { resolveJobConfig, validateSqlTimeouts } from '../core/jobConfig';
import { JobManager } from '../core/JobManager';
import { registry } from '../core/JobRegistry';
import { NormalizeSocioNamesJob } from '../jobs/NormalizeSocioNamesJob';
import { CopySociosJob } from '../jobs/CopySociosJob';
import { DeleteMigratedJob } from '../jobs/DeleteMigratedJob';
import { markDeleteTargets } from './operations/deleteMigrated';

const operations = {
    'EXP-06': {table:'teste_socios', job:NormalizeSocioNamesJob},
    'EXP-08': {table:'teste_socios', job:CopySociosJob},
    'EXP-09': {table:'teste_migracao', job:DeleteMigratedJob}
};
export interface ReviewOptions {
    operation: string; dataset: string; mode?: 'A'|'B'; id?: number; checkToken?: string;
    batchSize?: number; throttleMs?: number; statementTimeoutMs?: number; lockTimeoutMs?: number;
    signal?: AbortSignal;
}
const shapes: Record<string, Record<string,string>> = {
    teste_socios:{id:'int8',nome:'text',nome_normalizado:'text',documento:'text',processado:'bool'},
    teste_destino:{id:'int8',nome:'text',documento:'text'},
    teste_migracao:{id:'int8',uf:'text',migrado:'bool'}
};
function canonical(value: any): string {
    if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
}
function hash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
async function inspect(trx: Knex.Transaction, context: PersistenceContext, operation: string) {
    const schema = context.dataSchema ?? context.schema;
    const names = operation === 'EXP-09' ? ['teste_migracao'] : operation === 'EXP-08' ? ['teste_socios','teste_destino'] : ['teste_socios'];
    const data: Record<string,any[]> = {};
    for (const table of names) {
        const catalog = await trx.raw(`SELECT a.attname, t.typname FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
            JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
            JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
            WHERE n.nspname=? AND c.relname=? AND c.relkind='r' AND NOT c.relrowsecurity
            AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[schema,table]);
        const actual = Object.fromEntries(catalog.rows.map((r:any)=>[r.attname,r.typname]));
        // Controlled small review tables; varchar is compatible with text, no arbitrary DDL/artifact SQL.
        for (const key of Object.keys(actual)) if (actual[key] === 'varchar') actual[key] = 'text';
        if (canonical(actual) !== canonical(shapes[table])) throw new Error(`Schema/colunas incompatíveis: ${table}`);
        const unsafe = await trx.raw(`SELECT 1 FROM pg_catalog.pg_trigger g JOIN pg_catalog.pg_class c ON c.oid=g.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname=? AND NOT g.tgisinternal`,[schema,table]);
        if (unsafe.rows.length) throw new Error('Triggers externos não permitidos no review');
        const dependencies = await trx.raw(`SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=? AND c.relname=? AND (
                EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.contype='f' AND (k.conrelid=c.oid OR k.confrelid=c.oid)) OR
                EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid) OR
                EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid))`,[schema,table]);
        if (dependencies.rows.length) throw new Error('FK/regras/herança: dependências fora do contrato de review');
        const key = await trx.raw(`SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname='id' WHERE n.nspname=? AND c.relname=? AND a.attnotnull AND k.contype IN ('p','u') AND k.conkey=ARRAY[a.attnum]::smallint[]`,[schema,table]);
        if (!key.rows.length) throw new Error('Review exige id BIGINT PK/UNIQUE NOT NULL');
        const rows = await trx(table).withSchema(schema).orderBy('id').limit((context.clone?.config.maxRows ?? 1000)+1);
        if (rows.length > (context.clone?.config.maxRows ?? 1000) || rows.some((r:any)=>BigInt(r.id)<=0n)) throw new Error('Review exige até 1000 IDs positivos');
        data[table] = rows;
    }
    return data;
}
async function checkControl(trx: Knex.Transaction, context: PersistenceContext) {
    const allowed=['batch_jobs','batch_job_errors','batch_job_logs','review_snapshots',...(context.clone ? [] : Object.keys(shapes))];
    const tables=await trx.raw(`SELECT c.oid,c.relname,c.relkind,c.relrowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relkind IN ('r','p','v','m','f')`,[context.schema]);
    if(tables.rows.some((r:any)=>!allowed.includes(r.relname)||r.relkind!=='r'||r.relrowsecurity))throw new Error('Schema controle contém dependências/objetos fora do contrato');
    const unsafe=await trx.raw(`SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=? AND c.relname IN ('batch_jobs','batch_job_errors','batch_job_logs','review_snapshots') AND (
        EXISTS(SELECT 1 FROM pg_catalog.pg_trigger g WHERE g.tgrelid=c.oid AND NOT g.tgisinternal) OR
        EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid) OR
        EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) OR
        EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class f ON f.oid=k.confrelid JOIN pg_catalog.pg_namespace fn ON fn.oid=f.relnamespace WHERE k.conrelid=c.oid AND k.contype='f' AND (fn.nspname<>n.nspname OR f.relname NOT IN ('batch_jobs','batch_job_errors','batch_job_logs'))))`,[context.schema]);
    if(unsafe.rows.length)throw new Error('Controle contém triggers/regras/FK não autorizados');
}
async function install(trx: Knex.Transaction, context: PersistenceContext) {
    const exists = (await trx.raw('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=?',[context.schema])).rows.length > 0;
    if (!exists) await trx.raw('CREATE SCHEMA ??',[context.schema]);
    const hasJobs = await trx.schema.withSchema(context.schema).hasTable('batch_jobs');
    if (!hasJobs) {
        const tables = await trx.raw('SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=?',[context.schema]);
        if (tables.rows.some((r:any)=>!Object.keys(shapes).includes(r.tablename))) throw new Error('Schema controle não vazio/sem posse');
        await trx.raw('SET LOCAL search_path TO ??',[context.schema]);
        for (const name of ['001_create_batch_jobs','002_create_batch_job_errors','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state']) await require('../db/migrations/'+name).up(trx);
    }
    if (!await trx.schema.withSchema(context.schema).hasTable('review_snapshots')) {
        await trx.schema.withSchema(context.schema).createTable('review_snapshots',t=>{t.text('dataset').primary();t.text('operation').notNullable();t.jsonb('snapshot').notNullable();t.text('checksum').notNullable();});
    }
}
async function snapshot(trx: Knex.Transaction, context: PersistenceContext, options: ReviewOptions) {
    const saved = await trx('review_snapshots').withSchema(context.schema).where({dataset:options.dataset,operation:options.operation}).first();
    if (!saved || saved.checksum !== hash(saved.snapshot)) throw new Error('Snapshot ausente ou checksum inválido');
    return saved;
}
async function idle(trx: Knex.Transaction, context: PersistenceContext) {
    if (await trx.schema.withSchema(context.schema).hasTable('batch_jobs')) {
        const active = await trx('batch_jobs').withSchema(context.schema).whereIn('status',['pending','running','paused','failed']).first('id');
        if (active) throw new Error('Review exige resolver execução pendente/ativa/recuperável antes de preparar');
    }
}
/** Same runner exercised with explicitly fixture-only contexts. CLI clone never accepts that database. */
export async function reviewAction(context: PersistenceContext, action: string, options: ReviewOptions): Promise<any> {
    if (['validate','restore'].includes(action)) throw new Error('Ferramenta de resultado retirada do framework');
    validatePersistenceContext(context);
    assertAdmissionAllowed(options.signal);
    context={...context,admissionSignal:options.signal};
    const op = operations[options.operation as keyof typeof operations];
    if (!op || !options.dataset || options.dataset.length>200) throw new Error('Operação/dataset explícitos obrigatórios');
    if (!['check','prepare','mark','run','status','list','logs','errors','pause','cancel','resume','recover','dispatch'].includes(action)) throw new Error('Ação manual inválida');
    const config = resolveJobConfig(new op.job().config, {batchSize:options.batchSize ?? 1000,throttleMs:options.throttleMs ?? 0});
    validateSqlTimeouts(options);
    if (action === 'run' && !['A','B'].includes(options.mode ?? '')) throw new Error('Modo A/B obrigatório');
    if (['status','logs','errors','pause','cancel','resume','recover','dispatch'].includes(action) && (!Number.isSafeInteger(options.id)||options.id!<=0)) throw new Error('ID explícito obrigatório');
    if (!registry.has(options.operation)) registry.register(options.operation,op.job);
    if (['status','list','logs','errors','pause','cancel','resume','recover','dispatch'].includes(action)) {
        await context.db.transaction(async trx=>{await guardTransactionalConnection(trx,context);await checkControl(trx,context);});
        if (action==='list') return context.db('batch_jobs').withSchema(context.schema).whereRaw('transactional_state->>\'dataset\' = ? AND transactional_state->>\'operation\' = ?',[options.dataset,options.operation]).orderBy('id').select('id','job_name','status','created_at');
        const row=await BatchJobModel.findById(options.id!,context);
        if (!row || row.transactional_state?.dataset!==options.dataset || row.transactional_state?.operation!==options.operation) throw new Error('Execução não corresponde ao contexto/experimento/dataset');
        assertDurableTarget(row.transactional_state,context);
        if (action==='status') return BatchJobModel.toDTO(row);
        if (action==='logs'||action==='errors') return context.db(action==='logs'?'batch_job_logs':'batch_job_errors').withSchema(context.schema).where({job_id:options.id}).orderBy('id');
        if (action==='pause'||action==='cancel') return BatchJobModel.requestTransactionalControl(options.id!,action,context);
        if (action==='resume'||action==='recover') return BatchJobModel.requeueTransactional(options.id!,context,{recover:action==='recover'});
        assertAdmissionAllowed(options.signal);
        return JobManager.getInstance({maxConcurrentJobs:1}).runQueuedTransactional(options.id!,context);
    }
    const result = await context.db.transaction(async trx=>{
        await guardTransactionalConnection(trx,context);
        await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`${context.schema}:review`]);
        await checkControl(trx,context);
        const data = await inspect(trx,context,options.operation);
        const checkToken = hash({database:validatePersistenceContext(context),schema:context.schema,dataSchema:context.dataSchema ?? context.schema,operation:options.operation,dataset:options.dataset,data});
        if (action==='check') return {dryRun:true,checkToken,rows:Object.fromEntries(Object.entries(data).map(([t,r])=>[t,r.length])),operation:options.operation};
        if (['prepare','mark','run'].includes(action) && options.checkToken!==checkToken) throw new Error('check/dry-run token ausente ou dados mudaram; repetir check');
        if (action==='prepare') {
            await idle(trx,context);
            const job: TransactionalBatchJob = new op.job(config);
            if (options.operation!=='EXP-09') await job.validateInitial!(trx,context.dataSchema ?? context.schema,op.table);
            else if (data.teste_migracao.some(r=>r.migrado!==false)) throw new Error('Prepare EXP-09 exige migrado FALSE');
            await install(trx,context);
            if (await trx('review_snapshots').withSchema(context.schema).where({dataset:options.dataset}).first()) throw new Error('Dataset já preparado; não sobrescrever snapshot. Use outro conjunto inicial isolado');
            await trx('review_snapshots').withSchema(context.schema).insert({dataset:options.dataset,operation:options.operation,snapshot:data,checksum:hash(data)});
            return {prepared:true,dataset:options.dataset,checksum:hash(data)};
        }
        const saved = await snapshot(trx,context,options);
        if (action==='mark') {
            await idle(trx,context);
            if (options.operation!=='EXP-09'||hash(data)!==saved.checksum) throw new Error('Marcação exige snapshot inicial EXP-09 intacto');
            const marked=await markDeleteTargets(trx,context.dataSchema ?? context.schema,op.table);
            return {preparedMarking:true,marked,measured:false};
        }
        if (action==='run') {
            await idle(trx,context);
            const expectedInitial = options.operation==='EXP-09' ? {...saved.snapshot,teste_migracao:saved.snapshot.teste_migracao.map((r:any)=>({...r,migrado:r.uf==='SC'}))} : saved.snapshot;
            if (hash(data)!==hash(expectedInitial)) throw new Error('Dataset diverge da preparação; nova execução exige conjunto inicial isolado, nunca reset para resume');
            const job = new op.job(config);
            assertAdmissionAllowed(options.signal); // admin lock still held; no await before creation
            return BatchJobModel.createTransactional(options.operation,job.config,{table:op.table,mode:options.mode!,protocol:'3',dataset:options.dataset,operation:options.operation,eligibleOnly:options.operation==='EXP-09',statementTimeoutMs:options.statementTimeoutMs,lockTimeoutMs:options.lockTimeoutMs},{...context,db:trx},job.validateInitial);
        }
        throw new Error('Ação manual inválida');
    });
    if (action==='run') assertAdmissionAllowed(options.signal);
    if (action==='run') {
        if (!('id' in result)) throw new Error('Admissão não retornou execução');
        return JobManager.getInstance({maxConcurrentJobs:1}).runQueuedTransactional(result.id,context);
    }
    return result;
}
