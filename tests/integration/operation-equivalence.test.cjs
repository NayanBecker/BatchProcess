const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');
const {withFixture}=require('../helpers/phase-c-db.cjs');
const {JobManager}=require('../../src/core/JobManager');
const {registry}=require('../../src/core/JobRegistry');
after(()=>db.destroy());
test('EXP06 A/B via manager usa SQL comum e resultado independente, preserva origem',()=>withFixture(db,async schema=>{
  const {NormalizeSocioNamesJob}=require('../../src/jobs/NormalizeSocioNamesJob');
  registry.register('EXP06-fixture',NormalizeSocioNamesJob);
  await db.transaction(async trx=>{
    await trx.raw('SET LOCAL search_path TO ??',[schema]);
    for(const name of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state']) await require('../../src/db/migrations/'+name).up(trx);
  });
  await db.schema.withSchema(schema).createTable('source',t=>{t.bigInteger('id').primary();t.text('nome');t.text('nome_normalizado');t.boolean('processado');t.text('untouched');});
  const names=[null,'','  ana  silva  ',' joão ','CERTO'];
  const expected=[null,'','ANA  SILVA','JOÃO','CERTO'];
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  try {

    for(const mode of ['A','B']) {
      await db('source').withSchema(schema).delete();
      await db('source').withSchema(schema).insert(names.map((nome,i)=>({id:String(i+1),nome,processado:false,nome_normalizado:null,untouched:'keep'})));
      const result=await manager.runTransactional('EXP06-fixture',{db,schema},{table:'source',mode,protocol:'3',dataset:'synthetic',operation:'EXP06-v3'},{batchSize:2,throttleMs:0});
      assert.equal(result.status,'completed');
      assert.equal(result.transactional_state.commits,mode==='A'?'1':'3');
      assert.equal(result.transactional_state.changed,'5');
      const actual=await db('source').withSchema(schema).orderBy('id');
      assert.deepEqual(actual.map(r=>r.nome_normalizado),expected);
      assert.deepEqual(actual.map(r=>r.nome),names);
      assert.ok(actual.every(r=>r.processado===true&&r.untouched==='keep'));
    }
    await db('source').withSchema(schema).update({processado:null});
    const before=await db('batch_jobs').withSchema(schema).count('* as n').first();
    await assert.rejects(manager.runTransactional('EXP06-fixture',{db,schema},{table:'source',mode:'B',protocol:'3',dataset:'synthetic',operation:'EXP06-v3'}),/Estado inicial/);
    assert.deepEqual(await db('batch_jobs').withSchema(schema).count('* as n').first(),before);
  } finally {registry.unregister('EXP06-fixture');}
}));
