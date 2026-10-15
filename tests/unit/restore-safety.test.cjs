require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFixtureArtifact,restoreFixture}=require('../helpers/fixture-artifact');
test('restauração confirma banco real na conexão antes de qualquer DDL/DML',async()=>{
  const artifact=createFixtureArtifact([]);
  for(const database of ['postgres','backup_testes','origem']) {
    let mutations=0;
    const trx=()=>{mutations++;throw Error('write forbidden');};
    trx.raw=async sql=>{assert.equal(sql,'SELECT current_database() AS database');return {rows:[{database}]};};
    const db={transaction:fn=>fn(trx)};
    await assert.rejects(restoreFixture({db,schema:'phase_c_test_'+'a'.repeat(32)},artifact),/tcc_framework_test/);
    assert.equal(mutations,0);
  }
});
test('artefatos recusam IDs imprecisos/duplicados, NUL e volume fora de fixture',()=>{
  for(const rows of [[{id:9007199254740992,nome:null}],[{id:'01',nome:null}],[{id:'1',nome:null},{id:'1',nome:''}],[{id:'9223372036854775808',nome:null}],[{id:'1',nome:'\0'}],Array.from({length:1001},(_,i)=>({id:String(i+1),nome:null}))]) {
    assert.throws(()=>createFixtureArtifact(rows));
  }
  assert.equal(createFixtureArtifact([]).manifest.count,'0');
});
