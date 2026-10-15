require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const connection=require('../../src/db/conection');
const {BatchExecutor}=require('../../src/core/BatchExecutor');
const {BatchJob}=require('../../src/core/BatchJob');
const {BatchJobLogModel}=require('../../src/db/models');
const {JobManager}=require('../../src/core/JobManager');
const {registry}=require('../../src/core/JobRegistry');
// Persistence double only: exercise the real model's conditional UPDATE and real executor.
async function withRow(status,check,{cancelOnUpdate=false}={}) {
  const originalDb=connection.db,log=BatchJobLogModel.create;
  const row={id:71,job_name:'PauseFixture',status,batch_size:1,throttle_ms:0};
  let fetches=0,updates=0;
  connection.db=()=>{
    let where;
    return {
      where(value){where=value;return this;},
      async first(){return {...row};},
      update(value){updates++;if(cancelOnUpdate)row.status='cancelled';this.result=Object.entries(where).every(([key,v])=>row[key]===v)?[Object.assign(row,value)]:[];return this;},
      async returning(){return this.result;}
    };
  };
  BatchJobLogModel.create=async()=>{};
  class Legacy extends BatchJob {queryBuilder(){fetches++;throw Error('terminal must not fetch');}async processItem(){}}
  try {await check({row,Legacy,get fetches(){return fetches;},get updates(){return updates;}});}
  finally {connection.db=originalDb;BatchJobLogModel.create=log;}
}
test('completed and failed legacy rows stop without fetch or new lifecycle events',async()=>{
  for(const status of ['completed','failed']) await withRow(status,async state=>{
    const executor=new BatchExecutor();const events=[];
    for(const event of ['jobPaused','jobCompleted','jobFailed'])executor.on(event,()=>events.push(event));
    await executor.run(state.row,new state.Legacy());
    assert.equal(state.row.status,status);assert.equal(state.fetches,0);assert.deepEqual(events,[]);
  });
});
test('requestPause only emits after confirmed running to paused transition',async()=>{
  await withRow('running',async state=>{
    const executor=new BatchExecutor();const observed=[];
    executor.on('jobPaused',()=>observed.push(state.row.status));executor.requestPause();
    await executor.run(state.row,new state.Legacy());
    assert.equal(state.row.status,'paused');assert.deepEqual(observed,['paused']);assert.equal(state.updates,1);assert.equal(state.fetches,0);
  });
});
test('cancel winning conditional pause update emits no pause, including manager shutdown',async()=>{
  await withRow('running',async state=>{
    const executor=new BatchExecutor();let paused=0;
    executor.on('jobPaused',()=>paused++);executor.requestPause();await executor.run(state.row,new state.Legacy());
    assert.equal(state.row.status,'cancelled');assert.equal(paused,0);assert.equal(state.fetches,0);
  },{cancelOnUpdate:true});
  await withRow('cancelled',async state=>{
    JobManager.instance=null;const manager=JobManager.getInstance({maxConcurrentJobs:1});
    registry.register('PauseFixture',state.Legacy);let paused=0;
    manager.on('jobPaused',()=>paused++);
    try {
      await manager.dispatchJob(state.row,'shutdown-owner');
      const owned=manager.getActiveExecutors().get(state.row.id);
      assert.ok(owned);owned.on('jobPaused',()=>paused++);
      await manager.stop();
      assert.equal(state.row.status,'cancelled');assert.equal(paused,0);assert.equal(state.fetches,0);
      assert.equal(manager.getActiveExecutors().size,0);assert.deepEqual(manager.getActiveWorkers(),[]);
    } finally {await manager.stop();registry.unregister('PauseFixture');}
  });
});
test('pause requests preserve every terminal state without false pause notification',async()=>{
  for(const status of ['completed','failed'])await withRow(status,async state=>{
    const executor=new BatchExecutor();let paused=0;executor.on('jobPaused',()=>paused++);executor.requestPause();
    await executor.run(state.row,new state.Legacy());assert.equal(state.row.status,status);assert.equal(paused,0);assert.equal(state.fetches,0);
  });
});
test('requestPause on cancelled legacy row emits no jobPaused and preserves cancellation',async()=>{
  await withRow('cancelled',async state=>{
    const executor=new BatchExecutor();let paused=0,completed=0;
    executor.on('jobPaused',()=>paused++);executor.on('jobCompleted',()=>completed++);
    executor.requestPause();await executor.run(state.row,new state.Legacy());
    assert.equal(state.row.status,'cancelled');assert.equal(paused,0);assert.equal(completed,0);assert.equal(state.fetches,0);
  });
});
