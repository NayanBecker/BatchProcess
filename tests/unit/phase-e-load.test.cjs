'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('../../experiments/phase-e/load.cjs');
test('E: standalone pilot refuses arbitrary target/config arguments before credential loading',()=>{
 const {spawnSync}=require('node:child_process');const path=require('node:path');
 const r=spawnSync(process.execPath,['experiments/phase-e/run.cjs','--database=postgres'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});
 assert.equal(r.status,1);assert.match(r.stderr,/Uso: node experiments\/phase-e\/run.cjs/);
});
test('E: pilot plan balances order and refuses scaling beyond the small fixture contract',()=>{
 const {plan,validateConfig}=require('../../experiments/phase-e/pilot.cjs');
 const config=require('../../experiments/phase-e/pilot.config.json');
 validateConfig(config);const p=plan(config);assert.equal(p.length,9);
 for(let position=0;position<3;position++)assert.equal(new Set(p.filter(t=>t.position===position).map(t=>t.scenario)).size,3);
 assert.throws(()=>validateConfig({...config,rows:1001}));assert.deepEqual(plan(config),p);
 assert.throws(()=>validateConfig({...config,profiles:['write','write']}));
 assert.throws(()=>validateConfig({...config,profiles:[]}));
});
test('E: metrics expose measured seconds and counters, bounded labels and no experiment IDs',async()=>{
 const {createMetrics}=require('../../experiments/phase-e/metrics.cjs');const metrics=createMetrics();
 const server=metrics.server;await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{metrics.offer('A');metrics.record('A',{outcome:'completed',latencyMs:25});metrics.offer('A');metrics.record('A',{outcome:'timeouts',latencyMs:500});
 const text=await(await fetch(`http://127.0.0.1:${server.address().port}/metrics`)).text();
 assert.match(text,/tcc_load_offered_total\{scenario="A",profile="read"\} 2/);
 assert.match(text,/tcc_load_latency_seconds_sum\{scenario="A",profile="read"\} 0.025/);
 assert.match(text,/tcc_load_latency_seconds_count\{scenario="A",profile="read"\} 1/);
 assert.ok(!/jobId|dataset|expID/.test(text));assert.throws(()=>metrics.offer('random-id'));
 }finally{await new Promise(r=>server.close(r));}
});
test('E: metrics keep read and write populations separate',()=>{
 const m=require('../../experiments/phase-e/metrics.cjs').createMetrics();
 m.offer('A','write');m.record('A',{outcome:'completed',latencyMs:10},'write');
 assert.match(m.render(),/tcc_load_offered_total\{scenario="A",profile="write"\} 1/);
 assert.match(m.render(),/tcc_load_offered_total\{scenario="A",profile="read"\} 0/);
});
test('E: dashboard labels distinguish read and write series',()=>{
 const dashboard=require('../../observability/grafana/dashboards/phase-e.json');
 for(const p of dashboard.panels)for(const t of p.targets??[])if(t.expr!=='up{job="tcc-phase-e-load"}')assert.match(t.legendFormat,/\{\{profile\}\}/);
});
test('E: deterministic open-loop schedule and sample-qualified nearest-rank percentiles',()=>{
 const options={seed:42,rate:20,durationMs:1000,rows:100};
 const a=load.schedule(options);assert.deepEqual(a,load.schedule(options));
 assert.equal(a.length,20);assert.deepEqual(a.map(x=>x.scheduledMs),Array.from({length:20},(_,i)=>i*50));
 assert.ok(a.every(x=>x.id>=1&&x.id<=100));
 assert.equal(load.percentiles([1,2,3]).p95,null);
 const p=load.percentiles(Array.from({length:100},(_,i)=>i+1));
 assert.deepEqual([p.p50,p.p95,p.p99],[50,95,99]);assert.equal(p.method,'nearest-rank');
 assert.throws(()=>load.schedule({...options,rate:0}));
});
test('E: bounded backlog, deadline cancellation, drain and explicit accounting without omission',async()=>{
 let active=0,max=0,aborted=0;
 const result=await load.runLoad({seed:5,rate:200,durationMs:100,rows:10,concurrency:1,maxQueue:1,timeoutMs:20},async(req,signal)=>{
  active++;max=Math.max(max,active);
  try{await new Promise(resolve=>{signal.addEventListener('abort',()=>{aborted++;resolve();},{once:true});});}
  finally{active--;}
 });
 assert.equal(result.counts.offered,20);assert.equal(result.records.length,20);
 assert.equal(Object.values(result.counts).slice(1).reduce((a,b)=>a+b,0),20);
 assert.ok(result.counts.timeouts>0);assert.ok(result.counts.dropped>0);assert.ok(aborted>0);assert.equal(active,0);assert.equal(max,1);
 assert.ok(result.records.filter(r=>r.outcome==='timeouts').every(r=>r.censored&&r.latencyMs>=20));
 assert.ok(result.records.every(r=>r.scheduledMs===r.index*5));
 assert.ok(result.records.every(r=>r.finishedMs-r.scheduledMs===r.latencyMs));
 const bad=await load.runLoad({seed:1,rate:20,durationMs:50,rows:1,concurrency:1,maxQueue:0,timeoutMs:100},()=>{throw Error('secret SQL message');});
 assert.equal(bad.counts.errors,1);assert.ok(!JSON.stringify(bad).includes('secret'));
});
