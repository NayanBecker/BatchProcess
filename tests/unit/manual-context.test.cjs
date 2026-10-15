require('ts-node/register');
const {test}=require('node:test'); const assert=require('node:assert/strict');
test('explicit clone context validates exact database on the transaction; fixture guard cannot be broadened',async()=>{
 const {guardTransactionalConnection}=require('../../src/core/TransactionalOwnership');
 const config={connection:{host:'localhost',port:5433,database:'review_clone',user:'review'},target:{database:'review_clone',dataSchema:'review_data',controlSchema:'review_control',tables:['teste_socios','teste_destino','teste_migracao']},allowlist:['review_clone/review_data/review_control'],customSchemas:true,maxRows:1000};
 const context={schema:'review_control',dataSchema:'review_data',clone:{config,confirmation:'review_clone/review_data/review_control'}};
 await guardTransactionalConnection({raw:async()=>({rows:[{database:'review_clone'}]})},context);
 await assert.rejects(guardTransactionalConnection({raw:async()=>({rows:[{database:'postgres'}]})},context),/Destino/);
 await assert.rejects(guardTransactionalConnection({raw:async()=>({rows:[{database:'tcc_framework_test'}]})},'review_control'),/explícito/);
});
test('shared job creation verifies actual transaction database before insertion',async()=>{
 const {BatchJobModel}=require('../../src/db/models/BatchJobModel');const {resolveJobConfig}=require('../../src/core/jobConfig');let writes=0;
 const trx=()=>{writes++;throw Error('write attempted');};trx.raw=async()=>({rows:[{database:'postgres'}]});
 const target=()=>{writes++;throw Error('write attempted');};target.transaction=async callback=>callback(trx);
 const context={schema:`phase_c_test_${'a'.repeat(32)}`,db:target};
 await assert.rejects(BatchJobModel.create('blocked',resolveJobConfig(),context),/Destino/);assert.equal(writes,0);
});
