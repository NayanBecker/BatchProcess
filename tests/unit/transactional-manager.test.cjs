require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JobManager}=require('../../src/core/JobManager');
const {registry}=require('../../src/core/JobRegistry');
const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
test('polling não pode iniciar durante reserva experimental anterior ao primeiro await',async()=>{
  let release;
  class Waiting extends TransactionalBatchJob {
    async validate() { await new Promise(resolve=>{release=resolve;}); throw Error('validation-stop'); }
    async executeBatch() { throw Error('must not execute'); }
  }
  registry.register('Waiting',Waiting);
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  manager.pollAndDispatch=async()=>{};
  try {
    const run=manager.runTransactional('Waiting',{},{});
    const rejected=assert.rejects(run,/validation-stop/);
    try {
      await assert.rejects(manager.start(),/exclusividade local/);
    } finally {release(); await rejected;}
    assert.deepEqual(manager.getActiveWorkers(),[]);
  } finally {
    clearInterval(manager.pollInterval); manager.isRunning=false;
    registry.unregister('Waiting');
  }
});
