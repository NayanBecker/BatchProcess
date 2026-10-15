const {test,after}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');after(()=>db.destroy());
test('simulated Node SIGINT during manual admin check permanently closes command admission',async t=>withFixture(db,async data=>withFixture(db,async control=>{
 const {reviewAction}=require('../../src/experiments/reviewRunner');const {manualCommand}=require('../../src/cli/manual');const {JobManager}=require('../../src/core/JobManager');const {BatchJobModel}=require('../../src/db/models');const {NormalizeSocioNamesJob}=require('../../src/jobs/NormalizeSocioNamesJob');
 const context={db,schema:control,dataSchema:data};const operation='EXP-06',dataset='signal-admission';
 await db.schema.withSchema(data).createTable('teste_socios',q=>{q.bigInteger('id').primary();q.text('nome');q.text('nome_normalizado');q.text('documento');q.boolean('processado');});
 await db('teste_socios').withSchema(data).insert({id:'1',nome:' ana ',nome_normalizado:null,documento:null,processado:false});
 const checked=await reviewAction(context,'check',{operation,dataset});await reviewAction(context,'prepare',{operation,dataset,checkToken:checked.checkToken});
 const fs=require('node:fs'),read=fs.readFileSync,load=Module._load;
 const config={connection:{host:'not-connected.invalid',port:65534,database:'test_only_clone',user:'test_only'},target:{database:'test_only_clone',dataSchema:'test_data',controlSchema:'test_control',tables:['teste_socios','teste_destino','teste_migracao']},allowlist:['test_only_clone/test_data/test_control'],customSchemas:true,maxRows:1};
 for(const action of ['run','dispatch'])await t.test(action,async()=>{
  JobManager.instance=null;const manager=JobManager.getInstance({maxConcurrentJobs:1});
  let pending;if(action==='dispatch')pending=await BatchJobModel.createTransactional(operation,new NormalizeSocioNamesJob().config,{table:'teste_socios',mode:'B',operation,dataset,protocol:'3'},context);
  const before=await db('batch_jobs').withSchema(control).orderBy('id');let signals=0,lockSeen=false;
  const injected=new Proxy(db,{get(target,key){if(key==='transaction')return (cb,opts)=>db.transaction(async trx=>{
   const raw=trx.raw.bind(trx);const wrapped=new Proxy(trx,{get(target,key){if(key!=='raw')return Reflect.get(target,key);return function(sql,...args){if(sql.includes('pg_advisory_xact_lock'))lockSeen=true;
    const query=raw(sql,...args);
    if(sql.includes("c.relkind IN ('r','p','v','m','f')"))return (async()=>{const result=await query;signals++;process.emit('SIGINT');await manager.stop();return result;})();
    return query;};}});return cb(wrapped);
  },opts);return Reflect.get(target,key);}});
  // CLI configuration/pool are doubles; the real admin/check runner uses ONLY owned test fixtures.
  fs.readFileSync=function(path,...args){return path==='signal-config.json'?JSON.stringify(config):read.call(this,path,...args);};
  Module._load=function(request,...args){if(request==='knex')return ()=>({transaction:cb=>cb({raw:async()=>({rows:[{database:'test_only_clone'}]})}),destroy:async()=>{}});
   if(request==='../experiments/reviewRunner')return {reviewAction:(_ctx,a,opts)=>reviewAction({...context,db:injected},a,opts)};
   return load.call(this,request,...args);};
  try{
   const flags=['--config','signal-config.json','--confirm',config.allowlist[0],'--operation',operation,'--dataset',dataset];
   const outcome=await manualCommand([action,...flags,...(action==='run'?['--mode','B','--check-token',checked.checkToken]:['--id',String(pending.id)])]).then(value=>({value}),error=>({error}));
   assert.equal(signals,1);if(action==='run')assert.equal(lockSeen,true);
   assert.match(outcome.error?.message ?? 'command admitted',/interrompida|abort/i);
   assert.deepEqual(await db('batch_jobs').withSchema(control).orderBy('id'),before,'zero creation/acquisition writes');
   assert.equal((await db('teste_socios').withSchema(data).first()).processado,false);assert.deepEqual(manager.getActiveWorkers(),[]);
  }finally{Module._load=load;fs.readFileSync=read;await manager.stop();}
 });
})));
test('admission fences late validation and executor acquisition under owned fixture locks',async t=>withFixture(db,async schema=>{
 const {BatchJobModel}=require('../../src/db/models');const {resolveJobConfig}=require('../../src/core/jobConfig');const {BatchExecutor}=require('../../src/core/BatchExecutor');const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
 await db.transaction(async trx=>{await trx.raw('SET LOCAL search_path TO ??',[schema]);for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../src/db/migrations/'+n).up(trx);});
 await db.schema.withSchema(schema).createTable('source',q=>{q.bigInteger('id').primary();q.integer('value');});await db('source').withSchema(schema).insert({id:'1',value:0});
 const spec={table:'source',mode:'B',protocol:'3',dataset:'late-signal',operation:'late-signal'};
 await t.test('abort during initial validation prevents insert',async()=>{
  const abort=new AbortController();
  await assert.rejects(BatchJobModel.createTransactional('late',resolveJobConfig(),spec,{db,schema,admissionSignal:abort.signal},async()=>{abort.abort();}),/interrompida/);
  assert.deepEqual(await db('batch_jobs').withSchema(schema).select(),[]);
 });
 await t.test('abort during job validation prevents pending to running under session and row locks',async()=>{
  const abort=new AbortController();let executions=0;
  class Late extends TransactionalBatchJob {async validate(){abort.abort();}async executeBatch(){executions++;throw Error('not admitted');}}
  const job=new Late();const row=await BatchJobModel.createTransactional('late',job.config,spec,{db,schema});
  await assert.rejects(new BatchExecutor('late',{db,schema,admissionSignal:abort.signal}).run(row,job),/interrompida/);
  assert.deepEqual(await BatchJobModel.findById(row.id,{db,schema}),row);assert.equal(executions,0);
  assert.equal((await db('source').withSchema(schema).first()).value,0);
 });
}));
