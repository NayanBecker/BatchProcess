'use strict';
function integer(n,min,max,name){if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Invalid '+name);}
function schedule({seed,rate,durationMs,rows}){
 integer(seed,1,0xffffffff,'seed');integer(rate,1,200,'rate');integer(durationMs,1,30000,'duration');integer(rows,1,1000,'rows');
 let state=seed>>>0;
 return Array.from({length:Math.ceil(rate*durationMs/1000)},(_,index)=>{
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  return {index,id:1+state%rows,scheduledMs:index*1000/rate};
 });
}
function percentiles(values){
 const a=[...values].sort((a,b)=>a-b);const n=a.length;
 const pick=(p,min)=>n>=min?a[Math.ceil(p*n)-1]:null;
 return {n,method:'nearest-rank',minimumSamples:{p50:20,p95:100,p99:100},p50:pick(.5,20),p95:pick(.95,100),p99:pick(.99,100)};
}
const now=()=>Number(process.hrtime.bigint())/1e6;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
async function runLoad(options,execute,onRecord=()=>{},onOffer=()=>{}){
 const plan=schedule(options);
 integer(options.concurrency,1,8,'concurrency');integer(options.maxQueue,0,100,'queue');integer(options.timeoutMs,1,5000,'timeout');
 const start=now(),startedAt=new Date().toISOString();
 const counts={offered:0,completed:0,errors:0,timeouts:0,dropped:0};
 const records=[],queue=[],running=new Set();let active=0,maxActive=0,maxQueued=0;
 function finish(req,outcome,extra={}){
  const finishedMs=now()-start;
  const record={...req,outcome,finishedMs,latencyMs:finishedMs-req.scheduledMs,censored:outcome==='timeouts'||outcome==='dropped',missing:outcome==='dropped',...extra};
  counts[outcome]++;records.push(record);onRecord(record);
 }
 function pump(){
  while(active<options.concurrency&&queue.length){
   const req=queue.shift(),remaining=options.timeoutMs-(now()-start-req.scheduledMs);
   if(remaining<=0){finish(req,'timeouts',{startedMs:null,reason:'backlog-deadline'});continue;}
   active++;maxActive=Math.max(maxActive,active);
   const controller=new AbortController(),startedMs=now()-start;
   const timer=setTimeout(()=>controller.abort(),Math.ceil(remaining));
   const work=(async()=>{
    try{await Promise.resolve().then(()=>execute(req,controller.signal));finish(req,controller.signal.aborted||now()-start-req.scheduledMs>=options.timeoutMs?'timeouts':'completed',{startedMs});}
    catch(error){finish(req,controller.signal.aborted||error?.timeout?'timeouts':'errors',{startedMs});}
    finally{clearTimeout(timer);active--;running.delete(work);pump();}
   })();
   running.add(work);
  }
 }
 for(const req of plan){
  while(now()-start<req.scheduledMs)await sleep(req.scheduledMs-(now()-start));
  counts.offered++;onOffer(req);
  if(active>=options.concurrency&&queue.length>=options.maxQueue)finish(req,'dropped',{startedMs:null,reason:'queue-full'});
  else{queue.push(req);maxQueued=Math.max(maxQueued,queue.length);pump();}
 }
 while(now()-start<options.durationMs)await sleep(options.durationMs-(now()-start));
 while(running.size)await Promise.all([...running]);
 const elapsedMs=now()-start;
 records.sort((a,b)=>a.index-b.index);
 return {monotonicOriginMs:start,startedAt,finishedAt:new Date().toISOString(),counts,records,maxActive,maxQueued,elapsedMs,drainMs:Math.max(0,elapsedMs-options.durationMs),completedPerSecondIncludingDrain:counts.completed/(elapsedMs/1000),latencyMs:percentiles(records.filter(r=>r.outcome==='completed').map(r=>r.latencyMs)),latencyPopulation:'completed only; timeouts are right-censored; drops have no service latency'};
}
module.exports={schedule,percentiles,runLoad,now,sleep};
