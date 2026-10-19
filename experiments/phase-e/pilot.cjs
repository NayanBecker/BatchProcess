'use strict';
const {withDataset,prepareOperation,integrity}=require('./fixture.cjs');
const {createReadWorkload}=require('./postgres.cjs');
const {runLoad,schedule,now,sleep}=require('./load.cjs');
function validateConfig(c){
 const bounds={seed:[1,0xffffffff],rows:[1,1000],batchSize:[1,1000],rate:[1,200],durationMs:[100,10000],warmupMs:[50,2000],operationOffsetMs:[0,5000],recoveryReserveMs:[0,2000],concurrency:[1,8],maxQueue:[0,100],timeoutMs:[10,1000]};
 for(const [key,[min,max]]of Object.entries(bounds))if(!Number.isSafeInteger(c[key])||c[key]<min||c[key]>max)throw Error('Limite inválido: '+key);
 if(c.version!==1||c.repetitions!==3||!['read','write'].includes(c.profile)||c.metricsPort!==9465||c.operationOffsetMs+c.recoveryReserveMs>=c.durationMs)throw Error('Contrato do piloto pequeno inválido');
 if(c.profiles!==undefined&&JSON.stringify(c.profiles)!==JSON.stringify(['read','write']))throw Error('Perfis devem ser read e write separados');
 schedule(c);
}
function plan(c){validateConfig(c);const modes=['control','A','B'];const offset=c.seed%3;return Array.from({length:9},(_,i)=>({repetition:1+Math.floor(i/3),position:i%3,scenario:modes[(i%3+Math.floor(i/3)+offset)%3],seed:c.seed}));}
async function runTrial(db,c,trial,metrics){
 return withDataset(db,c,async f=>{
  const operation=await prepareOperation(db,f.schema,trial.scenario,c.batchSize);
  const adapter=createReadWorkload(db.client.connectionSettings,f.schema,c);
  try{
   const warmup=await runLoad({...c,durationMs:c.warmupMs},adapter.execute);
   if(warmup.counts.errors||warmup.counts.timeouts||warmup.counts.dropped)throw Object.assign(Error('Warmup inválido'),{pilotFailure:'warmup-outcomes',counts:warmup.counts});
   const start=now();let maintenance=null;
   const massive=(async()=>{
    await sleep(c.operationOffsetMs);
    const beginMs=now()-start;
    if(operation)await operation.run();
    maintenance={beginMs,endMs:now()-start,scope:'executor dispatch through return; includes ownership/control/audit, NOT protocol DML-only timer',notApplicable:!operation};
   })();
   // Install a rejection handler immediately, then drain BOTH branches before fixture cleanup.
   const load=runLoad(c,adapter.execute,r=>metrics?.record(trial.scenario,r,c.profile),()=>metrics?.offer(trial.scenario,c.profile));
   const settled=await Promise.allSettled([load,massive]);
   const failure=settled.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   const workload=settled[0].value;
   maintenance={...maintenance,monotonicBeginMs:start+maintenance.beginMs,monotonicEndMs:start+maintenance.endMs,beginMs:start+maintenance.beginMs-workload.monotonicOriginMs,endMs:start+maintenance.endMs-workload.monotonicOriginMs};
   const events=operation?await operation.evidence():null;
   const check=await integrity(db,f,trial.scenario,c.profile,[...warmup.records,...workload.records]);
   const overlap=operation?{
    scheduledDuringOperation:workload.records.filter(r=>r.scheduledMs>=maintenance.beginMs&&r.scheduledMs<=maintenance.endMs).length,
    inFlightDuringOperation:workload.records.filter(r=>r.startedMs!==null&&r.startedMs<=maintenance.endMs&&r.finishedMs>=maintenance.beginMs).length,
    recoveryObservedMs:Math.max(0,c.durationMs-maintenance.endMs),
    inadequateCoverage:workload.records.filter(r=>r.startedMs!==null&&r.startedMs<=maintenance.endMs&&r.finishedMs>=maintenance.beginMs).length<10,
    coverageRule:'fewer than 10 in-flight requests overlapping executor interval: descriptive coverage is insufficient; not a statistical threshold'
   }:null;
   return {...trial,profile:c.profile,fixtureSchema:f.schema,dataset:{version:f.version,rows:f.rows,sourceFingerprint:f.initialFingerprint,initialStateFingerprint:f.initialStateFingerprint,schemaContract:f.schemaContract},effectiveConfig:operation?.effectiveConfig??null,loadConfig:{...c},maintenance,overlap,warmup:{counts:warmup.counts,elapsedMs:warmup.elapsedMs,records:warmup.records},workload,events,integrity:check};
  }finally{await adapter.close();}
 });
}
module.exports={validateConfig,plan,runTrial};
