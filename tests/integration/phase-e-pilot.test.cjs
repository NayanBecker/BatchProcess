'use strict';
const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');
const fixture=require('../../research/experiments/phase-e/fixture.cjs');
after(()=>db.destroy());
test('E: database session lock refuses a concurrent pilot and releases cleanly',async()=>{
 const {acquirePilotGuard}=require('../../research/experiments/phase-e/guard.cjs');
 const first=await acquirePilotGuard(db.client.connectionSettings);
 try{await assert.rejects(acquirePilotGuard(db.client.connectionSettings),/already running/);}
 finally{await first();}
 const next=await acquirePilotGuard(db.client.connectionSettings);await next();
});
test('E: write profile uses only load_counter and independently reconciles warmup plus measured writes',async()=>{
 const {runTrial}=require('../../research/experiments/phase-e/pilot.cjs');
 const c={...require('../../research/experiments/phase-e/pilot.config.json'),profile:'write',rate:30,rows:10,durationMs:200,warmupMs:50,operationOffsetMs:50,recoveryReserveMs:50};
 const result=await runTrial(db,c,{scenario:'B',repetition:1,position:0,seed:c.seed});
 assert.equal(result.integrity.loadCounterTotal,result.warmup.counts.completed+result.workload.counts.completed);
 assert.equal(result.integrity.counterDivergences,0);assert.equal(result.integrity.divergences,0);
});
test('E: short trial records a common monotonic window and drained request evidence',async()=>{
 const {runTrial}=require('../../research/experiments/phase-e/pilot.cjs');
 const c={...require('../../research/experiments/phase-e/pilot.config.json'),rate:30,rows:10,durationMs:200,warmupMs:50,operationOffsetMs:50,recoveryReserveMs:50};
 const result=await runTrial(db,c,{scenario:'B',repetition:1,position:0,seed:c.seed});
 assert.equal(result.workload.counts.offered,6);assert.equal(result.workload.records.length,6);
 assert.equal(result.workload.monotonicOriginMs+result.maintenance.beginMs,result.maintenance.monotonicBeginMs);
 assert.equal(result.events.observation.visited,'10');assert.equal(result.integrity.divergences,0);
});
test('E: external fresh synthetic fixtures yield identical starts and independent A/B integrity',async()=>{
 const hashes=[];
 for(const scenario of ['control','A','B'])await fixture.withDataset(db,{rows:37,seed:42},async f=>{
  assert.match(f.initialStateFingerprint,/^[a-f0-9]{64}$/);assert.ok(f.schemaContract.columns.length===5);hashes.push(f.initialStateFingerprint);
  const operation=await fixture.prepareOperation(db,f.schema,scenario,10);
  if(operation)await operation.run();
  const check=await fixture.integrity(db,f,scenario);assert.equal(check.divergences,0);assert.equal(check.sourceUnchanged,true);
  if(operation){const evidence=await operation.evidence();assert.equal(evidence.status,'completed');assert.equal(evidence.observation.visited,'37');assert.equal(evidence.committed.length,scenario==='A'?1:4);assert.equal(evidence.missingConfirmations,0);}
 });
 assert.equal(new Set(hashes).size,1);
 await assert.rejects(fixture.withDataset(db,{rows:1001,seed:1},()=>{}),/rows/);
});
test('E: SQL deadline really cancels backend work, drains pool, and never updates source',async()=>{
 const {createReadWorkload}=require('../../research/experiments/phase-e/postgres.cjs');
 const {runLoad}=require('../../research/experiments/phase-e/load.cjs');
 await fixture.withDataset(db,{rows:5,seed:1},async f=>{
  const adapter=createReadWorkload(db.client.connectionSettings,f.schema,{concurrency:1,timeoutMs:40});
  try{
   const result=await runLoad({seed:1,rate:20,durationMs:50,rows:5,concurrency:1,maxQueue:0,timeoutMs:40},async(req,signal)=>adapter.execute(req,signal,'SELECT pg_sleep(2)'));
   assert.equal(result.counts.timeouts,1);assert.ok(result.elapsedMs<1500);
   assert.equal(adapter.pool.waitingCount,0);assert.equal(adapter.pool.idleCount,adapter.pool.totalCount);
   await fixture.integrity(db,f,'control');
  }finally{await adapter.close();}
 });
 assert.throws(()=>createReadWorkload({...db.client.connectionSettings,database:'postgres'},'public',{concurrency:1,timeoutMs:40}));
});
