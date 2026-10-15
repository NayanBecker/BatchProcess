require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const {resolveJobConfig}=require('../../src/core/jobConfig');
const {fixtureCommand}=require('../../src/cli/fixture');
const args=['run','--database','tcc_framework_test','--schema',`phase_c_test_${'a'.repeat(32)}`,'--mode','B','--dataset','limits-v1'];
async function withoutDatabaseImport(fn, expected) {
  const load=Module._load;let imports=0;
  Module._load=function(request,...rest) {
    if (request.includes('db/conection')) {imports++;throw Error('database imported');}
    return load.call(this,request,...rest);
  };
  try {await assert.rejects(fn,expected);assert.equal(imports,0);}
  finally {Module._load=load;}
}
test('SQL timeout overflow is rejected before CLI database import and API creation',async()=>{
  for (const flag of ['--statement-timeout-ms','--lock-timeout-ms']) {
    await withoutDatabaseImport(()=>fixtureCommand([...args,flag,'2147483648']),/Timeout de statement\/lock inválido/);
  }
  const {JobManager}=require('../../src/core/JobManager');
  const {BatchJobModel}=require('../../src/db/models');
  const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
  const {registry}=require('../../src/core/JobRegistry');
  class TimeoutLimits extends TransactionalBatchJob {async executeBatch(){throw Error('must not execute');}}
  registry.register('TimeoutLimits',TimeoutLimits);JobManager.instance=null;
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  const create=BatchJobModel.createTransactional;let creates=0;
  BatchJobModel.createTransactional=async()=>{creates++;throw Error('job created');};
  try {
    for (const key of ['statementTimeoutMs','lockTimeoutMs']) {
      await assert.rejects(manager.runTransactional('TimeoutLimits',{}, {[key]:2147483648}),/Timeout de statement\/lock inválido/);
    }
    assert.equal(creates,0);assert.deepEqual(manager.getActiveWorkers(),[]);
  } finally {BatchJobModel.createTransactional=create;registry.unregister('TimeoutLimits');}
});
test('SQL timeout bounds accept zero, omission and INT_MAX; model rejects invalid values before DB',async()=>{
  const {validateSqlTimeouts}=require('../../src/core/jobConfig');
  const {BatchJobModel}=require('../../src/db/models');
  for(const key of ['statementTimeoutMs','lockTimeoutMs']) {
    for(const value of [undefined,0,1,2147483647])assert.doesNotThrow(()=>validateSqlTimeouts({[key]:value}));
    for(const value of [-1,0.5,2147483648,Number.MAX_SAFE_INTEGER,NaN,Infinity]) {
      assert.throws(()=>validateSqlTimeouts({[key]:value}),/Timeout de statement\/lock inválido/);
      let transactions=0;
      await assert.rejects(BatchJobModel.createTransactional('Limits',resolveJobConfig(),
        {table:'teste_socios',mode:'B',dataset:'limits',protocol:'3',operation:'limits',[key]:value},
        {schema:`phase_c_test_${'a'.repeat(32)}`,db:{transaction(){transactions++;throw Error('DB accessed');}}}),/Timeout de statement\/lock inválido/);
      assert.equal(transactions,0);
    }
  }
});
test('boundary uses INT_MAX lookahead at maximum accepted batch without allocating a big fixture',async()=>{
  const {BatchIterator}=require('../../src/core/BatchIterator');let limit;
  const query={withSchema(){return this;},select(){return this;},where(){return this;},andWhere(){return this;},orderBy(){return this;},async limit(n){limit=n;return [{id:'1'}];}};
  const result=await BatchIterator.boundary(()=>query,{schema:'fixture',table:'items'},'0','1',2147483646);
  assert.equal(limit,2147483647);assert.deepEqual(result,{hi:'1',visited:'1',final:true});
  await assert.rejects(BatchIterator.boundary(()=>{throw Error('DB accessed');},{schema:'fixture',table:'items'},'0','1',2147483647),/batchSize inválido/);
});
test('batchSize reserves lookahead and rejects overflow before CLI DB import or API creation',async()=>{
  assert.equal(resolveJobConfig({batchSize:2147483646}).batchSize,2147483646);
  for (const batchSize of [0,-1,1.5,2147483647,2147483648,Number.MAX_SAFE_INTEGER]) {
    assert.throws(()=>resolveJobConfig({batchSize}),/batchSize inválido/);
  }
  await withoutDatabaseImport(()=>fixtureCommand([...args,'--batch-size','2147483647']),/batchSize inválido/);
  const {JobManager}=require('../../src/core/JobManager');
  const {BatchJobModel}=require('../../src/db/models');
  const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
  const {registry}=require('../../src/core/JobRegistry');
  class Limits extends TransactionalBatchJob {async executeBatch(){throw Error('must not execute');}}
  registry.register('Limits',Limits);JobManager.instance=null;
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  const create=BatchJobModel.createTransactional;let creates=0;
  BatchJobModel.createTransactional=async()=>{creates++;throw Error('job created');};
  try {
    await assert.rejects(manager.runTransactional('Limits',{}, {},{batchSize:2147483647}),/batchSize inválido/);
    assert.equal(creates,0);assert.deepEqual(manager.getActiveWorkers(),[]);
    let transactions=0;
    BatchJobModel.createTransactional=create;
    await assert.rejects(BatchJobModel.createTransactional('Limits',{...resolveJobConfig(),batchSize:2147483647},
      {table:'teste_socios',mode:'B',dataset:'limits',protocol:'3',operation:'limits'},
      {schema:`phase_c_test_${'a'.repeat(32)}`,db:{transaction(){transactions++;throw Error('DB accessed');}}}),/batchSize inválido/);
    assert.equal(transactions,0);
  } finally {BatchJobModel.createTransactional=create;registry.unregister('Limits');}
});
