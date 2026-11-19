const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');
const {BatchExecutor}=require('../../src/core/BatchExecutor');const {BatchJobModel}=require('../../src/db/models');const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
after(()=>db.destroy());
test('D: durable A/B events reconcile, rollback is not committed, observers cannot fail commit',()=>withFixture(db,async schema=>{
 await db.transaction(async trx=>{await trx.raw('SET LOCAL search_path TO ??',[schema]);for(const n of ['001_create_batch_jobs','002_create_batch_job_errors','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../src/db/migrations/'+n).up(trx);});
 await db.schema.withSchema(schema).createTable('source',t=>{t.bigInteger('id').primary();t.integer('value');});await db('source').withSchema(schema).insert([1,2,3,4,5].map(id=>({id,value:0})));
 class Inc extends TransactionalBatchJob {async executeBatch(c){const n=await c.trx(c.table).withSchema(c.schema).where('id','>',c.lo).where('id','<=',c.hi).increment('value',1);return {changed:String(n),inserted:'0',deleted:'0',sourceContent:'synthetic-not-to-log'};}}
 class Fail extends Inc {async executeBatch(c){await super.executeBatch(c);await c.trx.raw('SELECT 1/0');}}
 const context={db,schema};const evidence=[];
 for(const [mode,fail] of [['A',false],['B',false],['B',true]]){
  const job=fail?new Fail({batchSize:2}):new Inc({batchSize:2});const row=await BatchJobModel.createTransactional('d-fixture',job.config,{table:'source',mode,operation:'EXP-06',dataset:'synthetic',protocol:'3'},context);const ex=new BatchExecutor('d',context);ex.on('transactionalProgress',()=>{throw Error('observer');});
  if(fail)await assert.rejects(ex.run(row,job),/division by zero/);else await ex.run(row,job);
  const saved=await db('batch_jobs').withSchema(schema).where({id:row.id}).first();const events=await db('batch_job_logs').withSchema(schema).where({job_id:row.id,message:'batch_committed_v1'}).orderBy('id');const m=saved.transactional_state.observability;
  assert.ok(m);assert.ok(!JSON.stringify(events).includes('synthetic-not-to-log'));assert.equal(m.attempts,fail?1:events.length);assert.equal(m.failures,fail?1:0);assert.equal(m.samples,events.length);assert.equal(m.workSeconds,events.reduce((s,e)=>s+e.metadata.workSeconds,0));assert.equal(m.visited,String(events.reduce((s,e)=>s+BigInt(e.metadata.visited),0n)));assert.equal(m.samples,fail?0:mode==='A'?1:3);assert.equal(saved.status,fail?'failed':'completed');
  for(const field of ['visited','changed','inserted','deleted'])assert.equal(m[field],String(events.reduce((sum,event)=>sum+BigInt(event.metadata[field]),0n)));
  for(const event of events){assert.ok(event.metadata.workSeconds>=0);assert.ok(event.metadata.cpuSeconds>=0);assert.ok(event.metadata.rssSampleMaxBytes>0);assert.equal(event.metadata.durationScope,'transaction-entry-through-dml-before-checkpoint');}
  if(fail)assert.equal(events.length,0);evidence.push({mode,failed:fail,metrics:m});
 }
 const vals=await db('source').withSchema(schema).select('value');assert.ok(vals.every(r=>r.value===2));
 const durableRows=await db('batch_jobs').withSchema(schema).select('*');
 const {createServer,render}=require('../../observability/collector.cjs');
 const server=createServer(async()=>durableRows);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const text=await(await fetch(`http://127.0.0.1:${server.address().port}/metrics`)).text();assert.match(text,/tcc_batch_retained_samples\{operation="EXP-06",mode="B"\} 3/);assert.match(text,/tcc_batch_retained_attempts\{operation="EXP-06",mode="B"\} 4/);assert.match(text,/tcc_batch_retained_failures\{operation="EXP-06",mode="B"\} 1/);assert.ok(!text.includes('dataset=')&&!text.includes('jobId='));assert.equal(render(await db('batch_jobs').withSchema(schema).select('*')),render(durableRows));
 const fs=require('node:fs');fs.mkdirSync('observability/local',{recursive:true});fs.writeFileSync('observability/local/phase-d-fixture.prom',text);fs.writeFileSync('observability/local/phase-d-events.json',JSON.stringify({database:'tcc_framework_test',rows:5,evidence,events:await db('batch_job_logs').withSchema(schema).whereIn('message',['batch_committed_v1','batch_confirmed_v1']).select('job_id','message','metadata')},null,2));
 } finally {await new Promise(r=>server.close(r));}
 console.log(JSON.stringify({database:'tcc_framework_test',rows:5,evidence}));
}));
