const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');const {withFixture}=require('../helpers/phase-c-db.cjs');
const {BatchJobModel,BatchJobLogModel,BatchJobErrorModel}=require('../../src/db/models');after(()=>db.destroy());
test('shared models require explicit context and keep log/error writes off public',()=>withFixture(db,async schema=>{
 await db.transaction(async trx=>{await trx.raw('SET LOCAL search_path TO ??',[schema]);for(const n of ['001_create_batch_jobs','002_create_batch_job_errors','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../src/db/migrations/'+n).up(trx);});
 const {resolveJobConfig}=require('../../src/core/jobConfig');const row=await BatchJobModel.create('ctx',resolveJobConfig(),{db,schema});
 await BatchJobLogModel.create(row.id,'info','synthetic',{}, {db,schema});await BatchJobErrorModel.create(row.id,Error('synthetic'),undefined,0,{db,schema});
 assert.equal((await BatchJobLogModel.findByJobId(row.id,undefined,undefined,{db,schema})).length,1);
 assert.equal(await BatchJobErrorModel.countByJobId(row.id,{db,schema}),1);
 await assert.rejects(BatchJobLogModel.create(row.id,'info','blocked'),/Contexto/);
 await assert.rejects(BatchJobErrorModel.create(row.id,Error('blocked')),/Contexto/);
}));
