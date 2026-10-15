require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
test('clone config stays open and fails closed before connection; protected databases cannot opt in',()=>{
 const {validateCloneConfig}=require('../../src/experiments/cloneConfig');
 const valid={connection:{host:'localhost',port:5433,database:'review_clone',user:'review'},target:{database:'review_clone',dataSchema:'review_data',controlSchema:'review_control',tables:['teste_socios','teste_destino','teste_migracao']},allowlist:['review_clone/review_data/review_control'],customSchemas:true,maxRows:1000};
 assert.deepEqual(validateCloneConfig(valid,'review_clone/review_data/review_control'),valid);
 for(const database of ['postgres','backup_testes','tcc_framework_test']) assert.throws(()=>validateCloneConfig({...valid,connection:{...valid.connection,database},target:{...valid.target,database},allowlist:[`${database}/review_data/review_control`]},`${database}/review_data/review_control`),/proibido/);
 assert.throws(()=>validateCloneConfig({},''),/configuração/);
 assert.throws(()=>validateCloneConfig(valid,'wrong'),/confirmação/);
 assert.throws(()=>validateCloneConfig({...valid,customSchemas:false},'review_clone/review_data/review_control'),/opt-in/);
 assert.throws(()=>validateCloneConfig({...valid,target:{...valid.target,tables:['receitafederal_quadrosocietario']}},'review_clone/review_data/review_control'),/tabelas/);
});
