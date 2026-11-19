const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');after(()=>db.destroy());
test('durable execution target fences a later context with different data schema',async t=>withFixture(db,async schema=>withFixture(db,async other=>{
 await db.transaction(async trx=>{await trx.raw('SET LOCAL search_path TO ??',[schema]);for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../src/db/migrations/'+n).up(trx);});
 for(const s of [schema,other]) {await db.schema.withSchema(s).createTable('source',t=>{t.bigInteger('id').primary();t.integer('value');});await db('source').withSchema(s).insert({id:'1',value:0});}
 const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');const {BatchJobModel}=require('../../src/db/models');const {BatchExecutor}=require('../../src/core/BatchExecutor');
 class Inc extends TransactionalBatchJob {async executeBatch(c){await c.trx(c.table).withSchema(c.schema).increment('value',1);return {changed:'1',inserted:'0',deleted:'0'};}}
 const job=new Inc();const row=await BatchJobModel.createTransactional('inc',job.config,{table:'source',mode:'B',operation:'inc',dataset:'identity',protocol:'3'},{db,schema});
 await assert.rejects(new BatchExecutor('wrong',{db,schema,dataSchema:other}).run(row,job),/Destino durável/);
 assert.equal((await db('source').withSchema(other).first()).value,0);assert.equal((await BatchJobModel.findById(row.id,{db,schema})).status,'pending');
 const wrong={db,schema,dataSchema:other};
 for(const [action,status] of [['pause','running'],['cancel','running'],['resume','paused'],['recover','failed'],['delete','pending']]) {
  await t.test(action,async()=>{
  await db('batch_jobs').withSchema(schema).where({id:row.id}).update({status,transactional_state:{...row.transactional_state,ownershipProtocol:'session-affine-v1'}});
  const before=await BatchJobModel.findById(row.id,{db,schema});
  const call=action==='delete'?()=>BatchJobModel.deleteTransactional(row.id,wrong):action==='pause'||action==='cancel'?()=>BatchJobModel.requestTransactionalControl(row.id,action,wrong):()=>BatchJobModel.requeueTransactional(row.id,wrong,{recover:action==='recover'});
  await assert.rejects(call,/Destino durável/,action);
  assert.deepEqual(await BatchJobModel.findById(row.id,{db,schema}),before,`${action}: zero control writes`);
  assert.equal((await db('source').withSchema(schema).first()).value,0);
  assert.equal((await db('source').withSchema(other).first()).value,0);
  });
 }
})));