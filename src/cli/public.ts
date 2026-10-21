import knex from 'knex';
import path from 'path';
import {readRuntimeConfig,assertRuntimeControl,ConfigurationError,isSqlEntry} from '../core/runtimeConfig';
import {readSqlDefinition,SqlDefinition} from '../core/sqlDefinition';
import {SqlJob} from '../core/SqlJob';
import {guardTransactionalConnection,assertDurableTarget,validatePersistenceContext} from '../core/TransactionalOwnership';
import {BatchJobModel,PersistenceContext} from '../db/models/BatchJobModel';
import {TransactionalBatchJob} from '../core/TransactionalBatchJob';
import {register as registerClass} from '../core/JobRegistry';
import {JobManager} from '../core/JobManager';

const migrations=['001_create_batch_jobs','002_create_batch_job_errors','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'];
export async function initialize(context:PersistenceContext){
 if(!context.runtime) throw new ConfigurationError('Contexto público configurado obrigatório');
 validatePersistenceContext(context);
 const runtime=context.runtime;
 return context.db.transaction(async trx=>{
  const {rows}=await trx.raw('SELECT current_database() AS database');
  if(rows[0].database!==runtime.target.database) throw new ConfigurationError('Banco difere da confirmação');
  await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`${context.schema}:init`]);
  const exists=(await trx.raw('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=?',[context.schema])).rows.length;
  if(exists) {await assertRuntimeControl(trx,context.schema);}
  else {
   await trx.raw('CREATE SCHEMA ??',[context.schema]);
   await trx.raw("COMMENT ON SCHEMA ?? IS 'batcheman-control-v1'",[context.schema]);
   await trx.raw('SET LOCAL search_path TO ??',[context.schema]);
   for(const name of migrations) await require('../db/migrations/'+name).up(trx);
  }
  await assertRuntimeControl(trx,context.schema);
  return {initialized:true,database:runtime.target.database,controlSchema:context.schema};
 });
}
function summary(row:any){
 const s=row.transactional_state;
 return {id:row.id,job:row.job_name,status:row.status,mode:s.mode==='A'?'monolithic':'batch',highWater:s.highWater,cursor:s.cursor,visited:s.visited,changed:s.changed,inserted:s.inserted,deleted:s.deleted,commits:s.commits,errorCount:row.error_count,batchSize:row.effective_config.batchSize,throttle:row.effective_config.throttleMs,target:s.target,...(s.sqlDefinition?{sqlHash:s.sqlDefinition.hash,sqlOperation:s.sqlDefinition.operation}:{})};
}
export async function publicCommand(command:string,subject:string|undefined,options:Record<string,string>){
 const runtime=readRuntimeConfig(options['--config']);
 if(command==='jobs') return Object.entries(runtime.jobs).map(([name,j])=>({name,...j}));
 const selected=command==='register'?runtime.jobs[subject!]:null;
 if(command==='register'&&!selected) throw new ConfigurationError('Job não cadastrado no catálogo');
 const load=(name:string)=>{
  const entry=runtime.jobs[name]; if(!entry) throw new ConfigurationError('Job fora do catálogo');
  if(isSqlEntry(entry)) throw new ConfigurationError('Job SQL exige snapshot');
  const Job=require(path.resolve(__dirname,'..',entry.module))[entry.export];
  if(!(Job?.prototype instanceof TransactionalBatchJob)) throw new ConfigurationError('Contrato de job inválido');
  registerClass(name,Job);return Job;
 };
 let job:any;let definition:SqlDefinition|undefined;
 if(command==='register') {
  const config={batchSize:options['--batch-size']===undefined?1000:Number(options['--batch-size']),throttleMs:options['--throttle']===undefined?0:Number(options['--throttle'])};
  if(isSqlEntry(selected!)) {
   definition=readSqlDefinition(path.resolve(path.dirname(path.resolve(options['--config']??'batcheman.config.local.json')),selected!.sqlFile),selected!,runtime.target.dataSchema);
   job=new SqlJob(definition,config);
  }else{const Job=load(subject!);job=new Job(config);}
  await job.validate();
 }
 const c=runtime.connection;const password=process.env[c.passwordEnv];
 if(!password) throw new ConfigurationError('Variável passwordEnv ausente');
 const db=knex({client:'pg',connection:{host:c.host,port:c.port,database:c.database,user:c.user,password},pool:{min:0,max:4}});
 const context:PersistenceContext={db,schema:runtime.target.controlSchema,dataSchema:runtime.target.dataSchema,runtime};
 try {
  if(command==='init') return await initialize(context);
  await db.transaction(trx=>guardTransactionalConnection(trx,context));
  if(command==='register') {
   const row=await BatchJobModel.createTransactional(subject!,job.config,{table:selected!.table,mode:options['--mode']==='monolithic'?'A':'B',protocol:'batcheman-v1',dataset:'user',operation:subject!,...(definition?{sqlDefinition:definition}:{})},context,job.validateInitial?.bind(job));
   const saved=await BatchJobModel.findById(row.id,context);
   return summary(saved);
  }
  const id=Number(subject);const row=await BatchJobModel.findById(id,context);
  if(!row?.transactional_state) throw new ConfigurationError('Execução inexistente');
  assertDurableTarget(row.transactional_state,context);
  if(runtime.jobs[row.job_name]?.table!==row.transactional_state.table) throw new ConfigurationError('Catálogo diverge do destino durável');
  if(command==='status') return summary(row);
  if(command==='logs'||command==='errors') return await db(command==='logs'?'batch_job_logs':'batch_job_errors').withSchema(context.schema).where({job_id:id}).orderBy('id','desc').limit(200);
  if(command==='pause'||command==='cancel') {await BatchJobModel.requestTransactionalControl(id,command,context);return summary(await BatchJobModel.findById(id,context));}
  if(command==='resume'||command==='recover') {await BatchJobModel.requeueTransactional(id,context,{recover:command==='recover'});return summary(await BatchJobModel.findById(id,context));}
  if(!row.transactional_state.sqlDefinition) load(row.job_name);
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  const stop=()=>{void manager.stop();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try { await manager.runQueuedTransactional(id,context);return summary(await BatchJobModel.findById(id,context)); }
  finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 } finally {await db.destroy();}
}
