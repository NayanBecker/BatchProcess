const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {db}=require('../../src/db/conection');
const {withFixture}=require('../helpers/phase-c-db.cjs');
after(()=>db.destroy());
async function cli(compiled,args){
  const prefix=compiled?['dist/cli/index.js']:['-r','ts-node/register','src/cli/index.ts'];
  return exec(process.execPath,[...prefix,'fixture',...args],{cwd:process.cwd(),timeout:30000});
}
test('CLI dev e compilada recusam ferramentas de resultado retiradas',async()=>{
  for(const compiled of [false,true]) for(const action of ['validate','restore']) {
    await assert.rejects(cli(compiled,[action]),e=>e.code===1 && /retirada/.test(e.stderr));
  }
});
test('CLI não admite DML após sinal recebido durante guard inicial (evento Node simulado)',()=>withFixture(db,async schema=>{
  await require('../helpers/fixture-artifact').restoreFixture({db,schema},require('../fixtures/exp06-v1.json'));
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx.raw('SET LOCAL search_path TO ??',[schema]);
    for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state']) await require('../../src/db/migrations/'+n).up(trx);
  });
  const args=['run','--database','tcc_framework_test','--schema',schema,'--mode','B','--dataset','signal'];
  const code=`const ownership=require('./dist/core/TransactionalOwnership');const original=ownership.guardTransactionalConnection;let once=true;ownership.guardTransactionalConnection=async(...a)=>{await original(...a);if(once){once=false;process.emit('SIGINT');}};require('./dist/cli/fixture').fixtureCommand(${JSON.stringify(args)}).then(()=>console.log('unexpected-success'),e=>{console.error(e.message);process.exitCode=1;});`;
  await assert.rejects(exec(process.execPath,['-e',code],{cwd:process.cwd(),timeout:30000}),e=>e.code===1 && /interrompida/.test(e.stderr));
  assert.equal((await db('batch_jobs').withSchema(schema)).length,0);
  assert.equal((await db('teste_socios').withSchema(schema).where({processado:true})).length,0);
}));
test('CLI controle separado pede pausa, reenfileira e despacha sem duplicar prefixo',()=>withFixture(db,async schema=>{
  const {restoreFixture}=require('../helpers/fixture-artifact');
  const {BatchJobModel}=require('../../src/db/models/BatchJobModel');
  const {BatchExecutor}=require('../../src/core/BatchExecutor');
  const {NormalizeSocioNamesJob}=require('../../src/jobs/NormalizeSocioNamesJob');
  const context={db,schema};
  await restoreFixture(context,require('../fixtures/exp06-v1.json'));
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx.raw('SET LOCAL search_path TO ??',[schema]);
    for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state']) await require('../../src/db/migrations/'+n).up(trx);
  });
  const job=new NormalizeSocioNamesJob({batchSize:1});
  const row=await BatchJobModel.createTransactional('NormalizeSocioNamesJob',job.config,{table:'teste_socios',mode:'B',protocol:'3',dataset:'cli-controls',operation:'EXP-06-v1'},context);
  const scope=['--database','tcc_framework_test','--schema',schema,'--id',String(row.id)];
  const control=async action=>JSON.parse((await cli(true,[action,...scope])).stdout.trim().split('\n').at(-1));
  const executor=new BatchExecutor('cli-control',context);
  let request,error;
  executor.once('transactionalProgress',async()=>{try{request=await control('pause');}catch(e){error=e;}});
  await executor.run(row,job);
  assert.ifError(error);assert.equal(request.status,'running');
  assert.equal((await BatchJobModel.findById(row.id,context)).status,'paused');
  assert.equal((await control('resume')).status,'pending');
  assert.equal((await BatchJobModel.findById(row.id,context)).transactional_state.commits,'1');
  const stopped=new BatchExecutor('pause-before-work',context);stopped.requestPause();await stopped.run(row,job);
  assert.equal((await control('recover')).status,'pending');
  const done=await control('dispatch');assert.equal(done.status,'completed');assert.equal(done.transactionalState.commits,'3');
  await assert.rejects(cli(true,['cancel',...scope]),e=>e.code===1);
  assert.equal((await control('delete')).deleted,true);
  assert.equal(await BatchJobModel.findById(row.id,context),null);
}));
for(const compiled of [false,true]) test(`CLI fixture ${compiled?'compilada':'dev'} executa EXP06 e expõe configuração durável`,()=>withFixture(db,async schema=>{
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx.raw('SET LOCAL search_path TO ??',[schema]);
    for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state']) await require('../../src/db/migrations/'+n).up(trx);
    await trx.schema.withSchema(schema).createTable('teste_socios',t=>{t.bigInteger('id').primary();t.text('nome');t.text('nome_normalizado');t.boolean('processado');});
    await trx('teste_socios').withSchema(schema).insert([{id:'1',nome:null,processado:false},{id:'9007199254740993',nome:' ana ',processado:false}]);
  });
  const scope=['--database','tcc_framework_test','--schema',schema];
  const {stdout}=await cli(compiled,['run',...scope,'--mode','B','--batch-size','1','--throttle-ms','0','--dataset','cli-fixture']);
  const dto=JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(dto.status,'completed');assert.equal(dto.config.batchSize,1);
  assert.equal(dto.transactionalState.highWater,'9007199254740993');
  const status=JSON.parse((await cli(compiled,['status',...scope,'--id',String(dto.id)])).stdout.trim().split('\n').at(-1));
  assert.deepEqual(status.transactionalState,dto.transactionalState);
  assert.deepEqual((await db('teste_socios').withSchema(schema).orderBy('id')).map(r=>[r.nome_normalizado,r.processado]),[[null,true],['ANA',true]]);
  await assert.rejects(cli(compiled,['run',...scope,'--mode','B','--batch-size','0','--dataset','invalid']),e=>e.code===1);
  assert.equal((await db('batch_jobs').withSchema(schema)).length,1);
}));
