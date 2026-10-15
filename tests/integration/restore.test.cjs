const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');
const {withFixture}=require('../helpers/phase-c-db.cjs');
after(()=>db.destroy());
test('restauração recusa adulteração, origem e histórico sem alterar fixture',()=>withFixture(db,async schema=>{
  const {createFixtureArtifact,restoreFixture,inspectFixture}=require('../helpers/fixture-artifact');
  const artifact=createFixtureArtifact([{id:'1',nome:null}]),context={db,schema};
  await restoreFixture(context,artifact);
  const before=await inspectFixture(context);
  for(const change of [a=>a.rows[0].nome='',a=>a.manifest.table='receitafederal_quadrosocietario',a=>a.sql='DROP SCHEMA public CASCADE',a=>a.manifest.sha256='0'.repeat(64)]) {
    const tampered=JSON.parse(JSON.stringify(artifact));change(tampered);
    await assert.rejects(restoreFixture(context,tampered),/Artefato/);
    assert.deepEqual(await inspectFixture(context),before);
  }
  await assert.rejects(restoreFixture({db,schema:'public'},artifact),/Contexto/);
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx.schema.withSchema(schema).createTable('batch_jobs',t=>t.integer('id'));
  });
  await assert.rejects(restoreFixture(context,artifact),/histórico/);
  assert.deepEqual(await inspectFixture(context),before);
}));
test('artefato controlado restaura schema, PK e dados distinguindo NULL/vazio/BIGINT',()=>withFixture(db,async schema=>{
  const restore=require('../helpers/fixture-artifact');
  assert.equal(typeof restore.createFixtureArtifact,'function');
  const rows=[{id:'1',nome:null},{id:'9',nome:''},{id:'9007199254740993',nome:'  Ána  '}];
  const artifact=restore.createFixtureArtifact(rows);
  assert.deepEqual(artifact,require('../fixtures/exp06-v1.json'));
  const context={db,schema};
  await restore.restoreFixture(context,require('../fixtures/exp06-v1.json'));
  const before=await restore.inspectFixture(context);
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx.schema.withSchema(schema).alterTable('teste_socios',t=>t.text('unexpected'));
    await trx('teste_socios').withSchema(schema).update({nome:'changed',processado:true});
  });
  await assert.rejects(restore.inspectFixture(context),/Schema fixture divergente/);
  await restore.restoreFixture(context,artifact);
  assert.deepEqual(await restore.inspectFixture(context),before);
  assert.deepEqual(before,artifact.manifest);
  const columns=await db('information_schema.columns').where({table_schema:schema,table_name:'teste_socios'}).orderBy('ordinal_position').pluck('column_name');
  assert.deepEqual(columns,['id','nome','nome_normalizado','processado']);
  assert.deepEqual((await db('teste_socios').withSchema(schema).orderBy('id')).map(r=>({id:r.id,nome:r.nome})),rows);
  await assert.rejects(db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx('teste_socios').withSchema(schema).insert({id:'1'});
  }),/duplicate key/);
}));
