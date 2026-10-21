'use strict';
const {createHash}=require('node:crypto');
const {withFixture,assertTestDatabase}=require('../../../tests/helpers/phase-c-db.cjs');
function assertSchema(schema){if(!/^phase_c_test_[a-f0-9]{32}$/.test(schema))throw Error('Schema fora da allowlist');}
function sourceFingerprint(rows){return createHash('sha256').update(JSON.stringify(rows.map(r=>[String(r.id),r.nome]))).digest('hex');}
async function withDataset(db,options,work){
 if(!Number.isSafeInteger(options.rows)||options.rows<1||options.rows>1000)throw Error('rows deve estar em 1..1000');
 if(!Number.isSafeInteger(options.seed)||options.seed<1||options.seed>0xffffffff)throw Error('seed inválida');
 return withFixture(db,async schema=>{
  assertSchema(schema);
  await db.transaction(async trx=>{
   assertTestDatabase((await trx.raw('SELECT current_database() AS database')).rows[0].database);
   await trx.raw('SET LOCAL search_path TO ??',[schema]);
   for(const n of ['001_create_batch_jobs','002_create_batch_job_errors','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../../dist/db/migrations/'+n).up(trx);
   await trx.schema.withSchema(schema).createTable('source',t=>{t.bigInteger('id').primary();t.text('nome');t.text('nome_normalizado');t.boolean('processado').notNullable().defaultTo(false);t.integer('load_counter').notNullable().defaultTo(0);});
   const data=Array.from({length:options.rows},(_,i)=>({id:String(i+1),nome:i%11===0?null:`  synth_${options.seed}_${i}  `}));
   await trx('source').withSchema(schema).insert(data);await trx.raw('ANALYZE ??.source',[schema]);
  });
  const initial=await db('source').withSchema(schema).select('id','nome','nome_normalizado','processado','load_counter').orderBy('id');
  const columns=await db('columns').withSchema('information_schema').where({table_schema:schema,table_name:'source'}).orderBy('ordinal_position').select('column_name','data_type','is_nullable','column_default');
  const indexes=(await db.raw('SELECT indexdef FROM pg_indexes WHERE schemaname=? AND tablename=? ORDER BY indexname',[schema,'source'])).rows.map(r=>r.indexdef.replaceAll(schema,'<owned-schema>'));
  const schemaContract={columns,indexes};
  const initialStateFingerprint=createHash('sha256').update(JSON.stringify({schemaContract,initial})).digest('hex');
  return work({schema,rows:options.rows,seed:options.seed,version:'synthetic-exp06-v1',schemaContract,initialStateFingerprint,initialFingerprint:sourceFingerprint(initial)});
 });
}
async function integrity(db,f,scenario,profile='read',records=[]){
 assertSchema(f.schema);
 return db.transaction(async trx=>{
  assertTestDatabase((await trx.raw('SELECT current_database() AS database')).rows[0].database);
  const rows=await trx('source').withSchema(f.schema).select('id','nome','load_counter').orderBy('id');
  const {rows:checks}=await trx.raw(scenario==='control'?
   'SELECT count(*)::int AS n FROM ??.source WHERE processado IS DISTINCT FROM FALSE OR nome_normalizado IS NOT NULL':
   'SELECT count(*)::int AS n FROM ??.source WHERE processado IS DISTINCT FROM TRUE OR nome_normalizado IS DISTINCT FROM UPPER(TRIM(nome))',[f.schema]);
  const sourceUnchanged=rows.length===f.rows&&sourceFingerprint(rows)===f.initialFingerprint;
  const bounds=new Map();
  for(const r of records){const b=bounds.get(String(r.id))??{min:0,max:0};if(r.outcome==='completed'){b.min++;b.max++;}else if(r.startedMs!==null&&r.outcome!=='dropped')b.max++;bounds.set(String(r.id),b);}
  const counterDivergences=rows.filter(r=>{const b=profile==='write'?(bounds.get(String(r.id))??{min:0,max:0}):{min:0,max:0};return r.load_counter<b.min||r.load_counter>b.max;}).length;
  const result={rows:rows.length,divergences:checks[0].n,counterDivergences,loadCounterTotal:rows.reduce((n,r)=>n+r.load_counter,0),ambiguousWrites:profile==='write'?records.filter(r=>r.startedMs!==null&&['timeouts','errors'].includes(r.outcome)).length:0,sourceUnchanged,initialFingerprint:f.initialFingerprint};
  if(!sourceUnchanged||result.divergences!==0||counterDivergences!==0)throw Error('Integridade independente reprovada');
  return result;
 });
}
async function prepareOperation(db,schema,scenario,batchSize){
 assertSchema(schema);if(!['control','A','B'].includes(scenario))throw Error('Cenário inválido');
 if(scenario==='control')return null;
 const {BatchExecutor}=require('../../../dist/core/BatchExecutor');
 const {BatchJobModel}=require('../../../dist/db/models');
 const {NormalizeSocioNamesJob}=require('../../../dist/jobs/NormalizeSocioNamesJob');
 const context={db,schema},job=new NormalizeSocioNamesJob({batchSize,throttleMs:0});
 const row=await BatchJobModel.createTransactional('phase-e-exp06',job.config,{table:'source',mode:scenario,operation:'EXP-06',dataset:'synthetic-exp06-v1',protocol:'3+E1',statementTimeoutMs:3000,lockTimeoutMs:1000},context);
 return {effectiveConfig:row.effective_config,run:()=>new BatchExecutor('phase-e',context).run(row,job),evidence:async()=>{
  const saved=await db('batch_jobs').withSchema(schema).where({id:row.id}).first();
  const events=await db('batch_job_logs').withSchema(schema).where({job_id:row.id}).whereIn('message',['batch_committed_v1','batch_confirmed_v1']).orderBy('id').select('message','metadata');
  const committed=events.filter(e=>e.message==='batch_committed_v1').map(e=>e.metadata),confirmed=events.filter(e=>e.message==='batch_confirmed_v1').map(e=>e.metadata);
  const observation=saved.transactional_state.observability;
  if(saved.status!=='completed'||observation.samples!==committed.length)throw Error('Cobertura de eventos divergente');
  for(const key of ['visited','changed','inserted','deleted'])if(observation[key]!==String(committed.reduce((n,e)=>n+BigInt(e[key]),0n)))throw Error('Contadores não conciliados');
  return {status:saved.status,observation,committed,confirmed,missingConfirmations:committed.filter(e=>!confirmed.some(c=>c.sequence===e.sequence)).length};
 }};
}
module.exports={withDataset,prepareOperation,integrity,assertSchema};
