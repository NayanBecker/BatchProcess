require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JobManager}=require('../../src/core/JobManager');
const {BatchJobModel,BatchJobLogModel}=require('../../src/db/models');
const {BatchExecutor}=require('../../src/core/BatchExecutor');
const {BatchJob}=require('../../src/core/BatchJob');
const {registry}=require('../../src/core/JobRegistry');
test('polls concorrentes compartilham aquisição e shutdown espera poll em voo',async()=>{
  JobManager.instance=null;
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  const releases=[];let calls=0,finished=false;
  const original=BatchJobModel.findNextPending;
  BatchJobModel.findNextPending=async()=>{calls++;await new Promise(r=>releases.push(r));return null;};
  manager.isRunning=true;
  try {
    const first=manager.pollAndDispatch();
    const second=manager.pollAndDispatch();
    const stop=manager.stop().then(()=>finished=true);
    await new Promise(r=>setTimeout(r,10));
    try {assert.equal(calls,1);assert.equal(finished,false);}
    finally {releases.forEach(r=>r());await Promise.all([first,second,stop]);}
  } finally {BatchJobModel.findNextPending=original;}
});
test('shutdown drena trabalho mesmo se poll em voo rejeita',async()=>{
  JobManager.instance=null;
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  let release,finished=false;
  manager.track(new Promise(r=>release=r));
  manager.pollTask=Promise.reject(Error('poll-failure'));
  const stopping=manager.stop().then(()=>finished=true,e=>{finished=true;return e;});
  try {await new Promise(r=>setTimeout(r,10));assert.equal(finished,false);}
  finally {release();await stopping;}
});
test('listeners de conclusão não persistem duas vezes nem liberam slot antes do fim',async()=>{
  JobManager.instance=null;
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  class LegacyEvents extends BatchJob {async processItem(){}}
  registry.register('LegacyEvents',LegacyEvents);
  const run=BatchExecutor.prototype.run,log=BatchJobLogModel.create,complete=BatchJobModel.complete;
  let release,calls=0;
  BatchJobLogModel.create=async()=>{};BatchJobModel.complete=async()=>{calls++;};
  BatchExecutor.prototype.run=async function(){this.emit('jobCompleted',8,1);await new Promise(r=>release=r);};
  try {
    await manager.dispatchJob({id:8,job_name:'LegacyEvents',batch_size:1,throttle_ms:0},'events');
    try {assert.equal(calls,0);assert.equal(manager.getActiveExecutors().size,1);}
    finally {release();await manager.stop();}
    assert.equal(manager.getActiveExecutors().size,0);
  } finally {BatchExecutor.prototype.run=run;BatchJobLogModel.create=log;BatchJobModel.complete=complete;registry.unregister('LegacyEvents');}
});
test('cancelamento legado libera mapas em finally, shutdown aguarda somente próprios executores',async()=>{
  JobManager.instance=null;
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  class Legacy extends BatchJob { async processItem() {} }
  registry.register('Legacy',Legacy);
  const run=BatchExecutor.prototype.run,log=BatchJobLogModel.create,all=BatchJobModel.findAll;
  let release,finished=false,executor;
  BatchExecutor.prototype.run=async function(){executor=this;await new Promise(r=>release=r);};
  BatchJobLogModel.create=async()=>{};
  BatchJobModel.findAll=async()=>{throw Error('must not scan remote jobs');};
  try {
    await manager.dispatchJob({id:7,job_name:'Legacy',batch_size:1,throttle_ms:0},'owned');
    const stop=manager.stop().then(()=>finished=true);
    await new Promise(r=>setTimeout(r,10));
    try {assert.equal(finished,false);assert.equal(executor.pauseRequested,true);}
    finally {release();await stop;}
    assert.equal(manager.getActiveExecutors().size,0);assert.deepEqual(manager.getActiveWorkers(),[]);
  } finally {BatchExecutor.prototype.run=run;BatchJobLogModel.create=log;BatchJobModel.findAll=all;registry.unregister('Legacy');}
});
