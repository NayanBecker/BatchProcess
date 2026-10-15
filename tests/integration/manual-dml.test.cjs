const {test,after}=require('node:test'); const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection'); const {withFixture}=require('../helpers/phase-c-db.cjs');
const {JobManager}=require('../../src/core/JobManager'); const {registry}=require('../../src/core/JobRegistry');
after(()=>db.destroy());
for(const operation of ['EXP-08','EXP-09']) test(`${operation} shared A/B SQL, independent expected and origin/non-target preservation`,()=>withFixture(db,async schema=>{
 await db.transaction(async trx=>{await trx.raw('SET LOCAL search_path TO ??',[schema]);for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state'])await require('../../src/db/migrations/'+n).up(trx);});
 await db.schema.withSchema(schema).createTable('teste_socios',t=>{t.bigInteger('id').primary();t.text('nome');t.text('documento');});
 await db.schema.withSchema(schema).createTable('teste_destino',t=>{t.bigInteger('id').primary();t.text('nome');t.text('documento');});
 await db.schema.withSchema(schema).createTable('teste_migracao',t=>{t.bigInteger('id').primary();t.text('uf');t.boolean('migrado');});
 const source=[{id:'1',nome:null,documento:null},{id:'9',nome:'synthetic',documento:''},{id:'9007199254740993',nome:'Z',documento:'x'}];
 const rows=[{id:'1',uf:'SC',migrado:false},{id:'9',uf:'PR',migrado:false},{id:'9007199254740993',uf:'SC',migrado:false}];
 const {CopySociosJob}=require('../../src/jobs/CopySociosJob'); const {DeleteMigratedJob}=require('../../src/jobs/DeleteMigratedJob');
 const {markDeleteTargets}=require('../../src/experiments/operations/deleteMigrated');
 registry.register(operation,operation==='EXP-08'?CopySociosJob:DeleteMigratedJob); JobManager.instance=null;const manager=JobManager.getInstance({maxConcurrentJobs:1});
 try {for(const mode of ['A','B']) {
   for(const t of ['teste_socios','teste_destino','teste_migracao']) await db(t).withSchema(schema).delete();
   await db('teste_socios').withSchema(schema).insert(source);await db('teste_migracao').withSchema(schema).insert(rows);
   if(operation==='EXP-09')await db.transaction(trx=>markDeleteTargets(trx,schema,'teste_migracao'));
   const result=await manager.runTransactional(operation,{db,schema},{table:operation==='EXP-08'?'teste_socios':'teste_migracao',mode,protocol:'3',dataset:'dml-v1',operation,eligibleOnly:operation==='EXP-09'},{batchSize:1,throttleMs:0});
   assert.equal(result.status,'completed');
   if(operation==='EXP-08') {assert.equal(result.transactional_state.inserted,'3');assert.deepEqual(await db('teste_destino').withSchema(schema).orderBy('id'),source);assert.deepEqual(await db('teste_socios').withSchema(schema).orderBy('id'),source);}
   else {assert.equal(result.transactional_state.deleted,'2');assert.equal(result.transactional_state.visited,'2');assert.deepEqual(await db('teste_migracao').withSchema(schema).orderBy('id'),[rows[1]]);}
 }} finally {await manager.stop();registry.unregister(operation);}
}));
