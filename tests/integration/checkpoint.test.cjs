const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');
const {withFixture}=require('../helpers/phase-c-db.cjs');
const {BatchExecutor}=require('../../src/core/BatchExecutor');
const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
const {BatchJobModel}=require('../../src/db/models/BatchJobModel');
after(()=>db.destroy());
async function setup(schema) {
  await db.transaction(async trx=>{
    await trx.raw('SET LOCAL search_path TO ??',[schema]);
    for(const name of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state']) await require('../../src/db/migrations/'+name).up(trx);
  });
  await db.schema.withSchema(schema).createTable('source',t=>{t.bigInteger('id').primary();t.integer('value').notNullable();});
  await db('source').withSchema(schema).insert([{id:'1',value:0},{id:'9',value:0},{id:'9007199254740993',value:0}]);
}
class Update extends TransactionalBatchJob {
  async executeBatch(c) {
    const n=await c.trx(c.table).withSchema(c.schema).where('id','>',c.lo).where('id','<=',c.hi).update({value:1});
    if(this.fail) throw Error('after DML');
    return {changed:String(n),inserted:'0',deleted:'0'};
  }
}
test('executor reverte DML e checkpoint juntos e só notifica depois do commit',()=>withFixture(db,async schema=>{
  await setup(schema);
  const context={db,schema};
  const job=new Update({batchSize:2});
  const row=await BatchJobModel.createTransactional('Update',job.config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'test-v1'},context);
  assert.equal(row.transactional_state.highWater,'9007199254740993');
  job.fail=true;
  await assert.rejects(new BatchExecutor('w',context).run(row,job),/after DML/);
  assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(r=>r.value),[0,0,0]);
  const failed=await BatchJobModel.findById(row.id,context);
  assert.equal(failed.current_id,'0'); assert.equal(failed.status,'failed');
  job.fail=false;
  const next=await BatchJobModel.createTransactional('Update',job.config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'test-v1'},context);
  const executor=new BatchExecutor('w2',context);
  let events=0;
  const observed=[];
  executor.on('transactionalProgress',async state=>{
    events++;
    const persisted=await BatchJobModel.findById(next.id,context);
    observed.push([persisted.current_id,state.cursor]);
    throw Error('observer failure');
  });
  await executor.run(next,job);
  const done=await BatchJobModel.findById(next.id,context);
  assert.equal(done.status,'completed');
  assert.equal(done.current_id,'9007199254740993');
  assert.equal(done.transactional_state.visited,'3');
  assert.equal(done.transactional_state.changed,'3');
  assert.equal(done.transactional_state.commits,'2');
  assert.equal(events,2);
  assert.deepEqual(observed,[['9','9'],['9007199254740993','9007199254740993']]);
}));
test('erro SQL no checkpoint: A reverte tudo; B preserva só prefixo comprometido',()=>withFixture(db,async schema=>{
  await setup(schema);
  await db.raw('ALTER TABLE ??.batch_jobs ADD CONSTRAINT reject_final CHECK (current_id <= 9)',[schema]);
  for(const mode of ['A','B']) {
    await db('source').withSchema(schema).update({value:0});
    const context={db,schema}; const job=new Update({batchSize:2});
    const row=await BatchJobModel.createTransactional('Update',job.config,{table:'source',mode,protocol:'3',dataset:'fixture',operation:'test-v1'},context);
    await assert.rejects(new BatchExecutor('w',context).run(row,job),/reject_final/);
    assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(r=>r.value),mode==='A'?[0,0,0]:[1,1,0]);
    const failed=await BatchJobModel.findById(row.id,context);
    assert.equal(failed.status,'failed');
    assert.equal(failed.current_id,mode==='A'?'0':'9');
    assert.equal(failed.transactional_state.changed,mode==='A'?'0':'2');
  }
}));
test('statement_timeout cancela SQL real e não deixa escrita tardia',()=>withFixture(db,async schema=>{
  await setup(schema);
  class Slow extends Update {
    async executeBatch(c) {
      await c.trx.raw('SELECT pg_sleep(0.2)');
      return super.executeBatch(c);
    }
  }
  const context={db,schema}; const job=new Slow();
  const row=await BatchJobModel.createTransactional('Slow',job.config,{table:'source',mode:'A',protocol:'3',dataset:'fixture',operation:'slow-v1',statementTimeoutMs:30,lockTimeoutMs:30},context);
  await assert.rejects(new BatchExecutor('timeout',context).run(row,job), /statement timeout/);
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(r=>r.value),[0,0,0]);
  const failed=await BatchJobModel.findById(row.id,context);
  assert.equal(failed.current_id,'0'); assert.equal(failed.status,'failed');
}));

test('lock_timeout aborta contenção real e não escreve após liberação',()=>withFixture(db,async schema=>{
  await setup(schema);
  const context={db,schema},job=new Update({batchSize:1});
  const row=await BatchJobModel.createTransactional('Locked',job.config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'lock-v1',lockTimeoutMs:40,statementTimeoutMs:2000},context);
  const blocker=await db.transaction();
  try {
    assert.equal((await blocker.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await blocker('source').withSchema(schema).where({id:'1'}).forUpdate().first();
    await assert.rejects(new BatchExecutor('locked',context).run(row,job),e=>e.code==='55P03' && /lock timeout/.test(e.message));
  } finally {await blocker.rollback();}
  await new Promise(r=>setTimeout(r,60));
  assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(r=>r.value),[0,0,0]);
  const failed=await BatchJobModel.findById(row.id,context);
  assert.equal(failed.status,'failed');assert.equal(failed.current_id,'0');assert.equal(failed.transactional_state.commits,'0');
}));
test('entrada experimental recusa volume além de fixture antes de criar job',()=>withFixture(db,async schema=>{
  await setup(schema);
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx('source').withSchema(schema).delete();
    await trx('source').withSchema(schema).insert(Array.from({length:1001},(_,i)=>({id:String(i+1),value:0})));
  });
  const job=new Update();
  await assert.rejects(BatchJobModel.createTransactional('Update',job.config,{table:'source',mode:'A',protocol:'3',dataset:'small-guard',operation:'guard'},{db,schema}),/1000/);
  assert.equal((await db('batch_jobs').withSchema(schema)).length,0);
}));
test('preparação recusa fonte sem chave ID única antes de criar execução',()=>withFixture(db,async schema=>{
  await setup(schema);
  await db.schema.withSchema(schema).createTable('unsafe',t=>{t.bigInteger('id');});
  await db('unsafe').withSchema(schema).insert([{id:'1'},{id:'1'}]);
  const job=new Update();
  await assert.rejects(BatchJobModel.createTransactional('Update',job.config,{table:'unsafe',mode:'B',protocol:'3',dataset:'fixture',operation:'test-v1'},{db,schema}),/ID.*únic/);
  assert.equal((await db('batch_jobs').withSchema(schema)).length,0);
}));

test('INSERT SELECT: conflito aborta lote sem ocultação e preserva prefixo e contadores',()=>withFixture(db,async schema=>{
  await setup(schema);
  await db.schema.withSchema(schema).createTable('destination',t=>{t.bigInteger('id').primary();t.integer('value');});
  await db('destination').withSchema(schema).insert({id:'9',value:99});
  class Copy extends TransactionalBatchJob {
    async executeBatch(c) {
      const r=await c.trx.raw('INSERT INTO ??.destination (id,value) SELECT id,value FROM ??.source WHERE id > ? AND id <= ?', [c.schema,c.schema,c.lo,c.hi]);
      return {changed:'0',inserted:String(r.rowCount),deleted:'0'};
    }
  }
  const context={db,schema}; const job=new Copy({batchSize:1});
  const row=await BatchJobModel.createTransactional('Copy',job.config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'copy-v1'},context);
  await assert.rejects(new BatchExecutor('copy',context).run(row,job),/duplicate key/);
  const result=await BatchJobModel.findById(row.id,context);
  assert.equal(result.current_id,'1'); assert.equal(result.transactional_state.inserted,'1');
  assert.deepEqual((await db('destination').withSchema(schema).orderBy('id')).map(r=>[r.id,r.value]),[['1',0],['9',99]]);
  assert.equal((await db('source').withSchema(schema)).length,3);
}));

test('DELETE guarda fronteira anterior à remoção e conclui com contadores corretos',()=>withFixture(db,async schema=>{
  await setup(schema);
  class Remove extends TransactionalBatchJob {
    async executeBatch(c) {
      const n=await c.trx(c.table).withSchema(c.schema).where('id','>',c.lo).where('id','<=',c.hi).delete();
      return {changed:'0',inserted:'0',deleted:String(n)};
    }
  }
  const context={db,schema};const job=new Remove({batchSize:2});
  const row=await BatchJobModel.createTransactional('Remove',job.config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'delete-v1'},context);
  await new BatchExecutor('delete',context).run(row,job);
  const done=await BatchJobModel.findById(row.id,context);
  assert.equal(done.current_id,'9007199254740993');assert.equal(done.transactional_state.deleted,'3');
  assert.equal(done.transactional_state.commits,'2');assert.equal(done.status,'completed');
  assert.equal((await db('source').withSchema(schema)).length,0);
}));

test('dataset vazio conclui explicitamente e disputa do mesmo job admite apenas um executor',()=>withFixture(db,async schema=>{
  await setup(schema);
  await db('source').withSchema(schema).delete();
  const context={db,schema}; const job=new Update({batchSize:2});
  const row=await BatchJobModel.createTransactional('Update',job.config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'test-v1'},context);
  const results=await Promise.allSettled([new BatchExecutor('a',context).run(row,job),new BatchExecutor('b',context).run(row,job)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const done=await BatchJobModel.findById(row.id,context);
  assert.equal(done.status,'completed'); assert.equal(done.transactional_state.visited,'0');
  assert.equal(done.transactional_state.highWater,'0'); assert.equal(done.transactional_state.commits,'1');
}));
