const {test,after}=require('node:test');const assert=require('node:assert/strict');const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');after(()=>db.destroy());
test('active executor records durable job logs and one SQL failure without retry or rolled-back counters',()=>withFixture(db,async schema=>{
 await db.transaction(async trx=>{await trx.raw('SET LOCAL search_path TO ??',[schema]);for(const n of ['001_create_batch_jobs','002_create_batch_job_errors','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../src/db/migrations/'+n).up(trx);});
 await db.schema.withSchema(schema).createTable('source',t=>{t.bigInteger('id').primary();t.integer('value');});await db('source').withSchema(schema).insert({id:'1',value:0});
 const {BatchExecutor}=require('../../src/core/BatchExecutor');const {BatchJobModel}=require('../../src/db/models');const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
 class Fail extends TransactionalBatchJob {async executeBatch(c){await c.trx(c.table).withSchema(c.schema).increment('value',1);throw Error('synthetic failure');}}
 const job=new Fail();const context={db,schema};const row=await BatchJobModel.createTransactional('failure',job.config,{table:'source',mode:'B',protocol:'3',operation:'failure',dataset:'audit'},context);
 await assert.rejects(new BatchExecutor('audit',context).run(row,job),/synthetic/);
 const saved=await BatchJobModel.findById(row.id,context);assert.equal(saved.status,'failed');assert.equal(saved.error_count,1);assert.equal(saved.transactional_state.changed,'0');assert.equal((await db('source').withSchema(schema).first()).value,0);
 assert.equal((await db('batch_job_errors').withSchema(schema).where({job_id:row.id})).length,1);
 const logs=await db('batch_job_logs').withSchema(schema).where({job_id:row.id}).orderBy('id');assert.deepEqual(logs.map(r=>r.message),['running','batch_admitted_v1','failed']);
}));
