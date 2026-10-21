'use strict';
const http=require('node:http');
const scenarios=['control','A','B'],outcomes=['completed','errors','timeouts','dropped'];
const buckets=[.001,.005,.01,.025,.05,.1,.25,.5,1,2,5,Infinity];
function createMetrics(){
 const keys=['read','write'].flatMap(p=>scenarios.map(s=>p+':'+s));
 const data=Object.fromEntries(keys.map(s=>[s,{offered:0,counts:Object.fromEntries(outcomes.map(x=>[x,0])),n:0,sum:0,buckets:buckets.map(()=>0)}]));
 function get(s,p){if(!scenarios.includes(s)||!['read','write'].includes(p))throw Error('Cenário fora da allowlist');return data[p+':'+s];}
 function offer(s,p='read'){get(s,p).offered++;}
 function record(s,r,p='read'){const d=get(s,p);if(!outcomes.includes(r.outcome)||!Number.isFinite(r.latencyMs)||r.latencyMs<0)throw Error('Amostra inválida');d.counts[r.outcome]++;if(r.outcome==='completed'){const sec=r.latencyMs/1000;d.n++;d.sum+=sec;buckets.forEach((b,i)=>{if(sec<=b)d.buckets[i]++;});}}
 function render(){
  const lines=['# HELP tcc_load_offered_total Scheduled arrivals actually offered by the open-loop scheduler.','# TYPE tcc_load_offered_total counter','# HELP tcc_load_outcomes_total Terminal outcomes including drops and censored timeouts.','# TYPE tcc_load_outcomes_total counter','# HELP tcc_load_latency_seconds Completed requests only: scheduled arrival through response including backlog and pool; excludes censored outcomes.','# TYPE tcc_load_latency_seconds histogram'];
  for(const p of ['read','write'])for(const s of scenarios){const d=data[p+':'+s],labels=`scenario="${s}",profile="${p}"`;lines.push(`tcc_load_offered_total{${labels}} ${d.offered}`);for(const o of outcomes)lines.push(`tcc_load_outcomes_total{${labels},outcome="${o}"} ${d.counts[o]}`);buckets.forEach((b,i)=>lines.push(`tcc_load_latency_seconds_bucket{${labels},le="${b===Infinity?'+Inf':b}"} ${d.buckets[i]}`));lines.push(`tcc_load_latency_seconds_sum{${labels}} ${d.sum}`,`tcc_load_latency_seconds_count{${labels}} ${d.n}`);}
  return lines.join('\n')+'\n';
 }
 const server=http.createServer((req,res)=>{if(req.url!=='/metrics'){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/plain; version=0.0.4'}).end(render());});
 return {server,offer,record,render};
}
module.exports={createMetrics};
