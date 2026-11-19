const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');after(()=>db.destroy());
test('persisted timing accumulates active and paused intervals over explicit resume',()=>withFixture(db,async schema=>{
 await db.transaction(async trx=>{await trx.raw('SET LOCAL search_path TO ??',[schema]);for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../src/db/migrations/'+n).up(trx);});
 await db.schema.withSchema(schema).createTable('source',t=>{t.bigInteger('id').primary();t.integer('value');});await db('source').withSchema(schema).insert([{id:'1',value:0},{id:'9',value:0}]);
 const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');const {BatchJobModel}=require('../../src/db/models');const {BatchExecutor}=require('../../src/core/BatchExecutor');
 class Inc extends TransactionalBatchJob {async executeBatch(c){await c.trx.raw('SELECT pg_sleep(0.02)');await c.trx(c.table).withSchema(c.schema).where('id','>',c.lo).where('id','<=',c.hi).increment('value',1);return {changed:'1',inserted:'0',deleted:'0'};}}
 const context={db,schema};const job=new Inc({batchSize:1});const row=await BatchJobModel.createTransactional('inc',job.config,{table:'source',mode:'B',operation:'inc',dataset:'timing',protocol:'3'},context);
 const executor=new BatchExecutor('timing',context);executor.once('transactionalProgress',()=>BatchJobModel.requestTransactionalControl(row.id,'pause',context));await executor.run(row,job);
 const paused=await BatchJobModel.findById(row.id,context);assert.equal(paused.status,'paused');const prefix=BatchJobModel.toDTO(paused).metrics.activeDurationMs;assert.ok(prefix>=20);
 await new Promise(r=>setTimeout(r,60));await BatchJobModel.requeueTransactional(row.id,context);await new BatchExecutor('resume',context).run(await BatchJobModel.findById(row.id,context),job);
 const metrics=BatchJobModel.toDTO(await BatchJobModel.findById(row.id,context)).metrics;assert.ok(metrics.activeDurationMs>=prefix+20);assert.ok(metrics.pausedDurationMs>=55);assert.ok(metrics.wallDurationMs>=metrics.activeDurationMs+metrics.pausedDurationMs);assert.equal(metrics.timingUncertain,false);
}));
