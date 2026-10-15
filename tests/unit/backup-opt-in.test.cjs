require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateCloneConfig,resolveClonePassword}=require('../../src/experiments/cloneConfig');
function config(){return {connection:{host:'127.0.0.1',port:5432,database:'backup_testes',user:'postgres',passwordEnv:'BATCH_REVIEW_PASSWORD'},target:{database:'backup_testes',dataSchema:'review_data',controlSchema:'benchmark_control',tables:['teste_socios','teste_destino','teste_migracao']},allowlist:['backup_testes/review_data/benchmark_control'],customSchemas:true,authorizedDisposableBackup:true,maxRows:1000};}
const target='backup_testes/review_data/benchmark_control';
test('disposable backup requires strict opt-in and fixed private target',()=>{
 const c=config();assert.equal(validateCloneConfig(c,target),c);
 for(const patch of [{authorizedDisposableBackup:false},{target:{...c.target,dataSchema:'public'}},{target:{...c.target,controlSchema:'other'}},{connection:{...c.connection,database:'postgres'},target:{...c.target,database:'postgres'}}])assert.throws(()=>validateCloneConfig({...c,...patch},target));
 assert.throws(()=>validateCloneConfig(c,'wrong'));
 assert.throws(()=>validateCloneConfig({...c,allowlist:[]},target));
});
test('password reads only explicitly named environment and fails closed',()=>{
 assert.equal(resolveClonePassword({passwordEnv:'TEST_REVIEW_SECRET'},{TEST_REVIEW_SECRET:'test-only',PGPASSWORD:'ignored'}),'test-only');
 assert.throws(()=>resolveClonePassword({passwordEnv:'TEST_REVIEW_SECRET'},{PGPASSWORD:'ignored'}),/variável/);
 assert.equal(resolveClonePassword({}, {PGPASSWORD:'ignored'}),'');
 assert.throws(()=>validateCloneConfig({...config(),connection:{...config().connection,passwordEnv:'bad-name'}},target),/variável/);
 assert.throws(()=>validateCloneConfig({...config(),connection:{...config().connection,password:'inline'}},target),/segredo/);
});
test('backup transaction rejects unowned preexisting schemas before SQL work',async()=>{
 const {guardTransactionalConnection}=require('../../src/core/TransactionalOwnership');
 const context={schema:'benchmark_control',dataSchema:'review_data',clone:{config:config(),confirmation:target}};
 const raw=async sql=>({rows:sql.includes('current_database')?[{database:'backup_testes'}]:[]});
 await assert.rejects(guardTransactionalConnection({raw},context),/posse/);
});
