require('ts-node/register');const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const {resolveJobConfig}=require('../../src/core/jobConfig');
test('throttle INT32 bound prevents Node timer overflow before API/model persistence',async()=>{
 assert.equal(resolveJobConfig({throttleMs:2147483647}).throttleMs,2147483647);
 assert.throws(()=>resolveJobConfig({throttleMs:2147483648}),/throttleMs/);
 const {BatchJobModel}=require('../../src/db/models');const {JobManager}=require('../../src/core/JobManager');const {registry}=require('../../src/core/JobRegistry');const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
 class Throttle extends TransactionalBatchJob {async executeBatch(){throw Error('must not run');}}
 registry.register('ThrottleBound',Throttle);JobManager.instance=null;const manager=JobManager.getInstance({maxConcurrentJobs:1});let writes=0;
 const original=BatchJobModel.createTransactional;BatchJobModel.createTransactional=async()=>{writes++;throw Error('created');};
 try{await assert.rejects(manager.runTransactional('ThrottleBound',{}, {},{throttleMs:2147483648}),/throttleMs/);assert.equal(writes,0);}
 finally{BatchJobModel.createTransactional=original;registry.unregister('ThrottleBound');}
 const ctx={schema:`phase_c_test_${'a'.repeat(32)}`,db:{transaction(){writes++;throw Error('DB accessed');}}};
 const config={...resolveJobConfig(),throttleMs:2147483648};
 await assert.rejects(BatchJobModel.createTransactional('x',config,{table:'teste_socios',mode:'B',dataset:'x',operation:'x',protocol:'3'},ctx),/throttleMs/);
 await assert.rejects(BatchJobModel.create('x',config,ctx),/throttleMs/);assert.equal(writes,0);
});
test('fixture throttle overflow rejects before global database import',async()=>{
 const {fixtureCommand}=require('../../src/cli/fixture');const load=Module._load;let imports=0;
 Module._load=function(request,...rest){if(request.includes('db/conection')){imports++;throw Error('database imported');}return load.call(this,request,...rest);};
 try{await assert.rejects(fixtureCommand(['run','--database','tcc_framework_test','--schema',`phase_c_test_${'a'.repeat(32)}`,'--mode','B','--dataset','x','--throttle-ms','2147483648']),/throttleMs/);assert.equal(imports,0);}
 finally{Module._load=load;}
});
