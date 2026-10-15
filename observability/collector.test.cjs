const {test}=require('node:test');const assert=require('node:assert/strict');
const {render,createServer}=require('./collector.cjs');
test('committed snapshots reconcile without scrape increments or arbitrary labels',()=>{
 const rows=[{status:'completed',error_count:0,transactional_state:{operation:'EXP-06',mode:'B',visited:'20',changed:'20',inserted:'0',deleted:'0',commits:'3',dataset:'private',timing:{activeMs:315,pausedMs:0,uncertain:false}}}];
 const a=render(rows);assert.equal(a,render(rows));assert.match(a,/tcc_committed_visited\{operation="EXP-06",mode="B"\} 20/);assert.match(a,/tcc_active_seconds\{operation="EXP-06",mode="B"\} 0.315/);assert.doesNotMatch(a,/private|job_id|_total|batch_duration/);
 assert.doesNotMatch(render([{status:'completed',transactional_state:{operation:'arbitrary',mode:'B'}}]),/arbitrary/);
});
test('versioned retained metrics preserve missing history, bound labels and reject invented observations',()=>{
 const state={operation:'EXP-06',mode:'B',visited:'5',changed:'5',inserted:'0',deleted:'0',commits:'3'};
 assert.doesNotMatch(render([{status:'completed',transactional_state:state}]),/^tcc_batch_retained_samples\{/m);
 const observation={version:1,attempts:4,failures:1,samples:3,visited:'5',changed:'5',inserted:'0',deleted:'0',workSeconds:0.03,cpuSeconds:0.01,rssSampleMaxBytes:123456};
 const rows=[{id:777,status:'completed',transactional_state:{...state,dataset:'private',observability:observation}}];
 const a=render(rows);assert.equal(a,render(rows));assert.match(a,/tcc_batch_retained_unresolved\{operation="EXP-06",mode="B"\} 0/);assert.doesNotMatch(a,/777|private|dataset=|jobId=/);assert.throws(()=>render([{status:'completed',transactional_state:{...state,observability:{...observation,attempts:0}}}]),/Inconsistent/);
});
test('HTTP serves real exposition and fails closed on unavailable database',async()=>{
 let fail=false;const s=createServer(async()=>{if(fail)throw Error('password-sensitive');return []});await new Promise(r=>s.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${s.address().port}`;let r=await fetch(url+'/metrics');assert.equal(r.status,200);assert.match(await r.text(),/tcc_collector_read_success 1/);fail=true;r=await fetch(url+'/metrics');const text=await r.text();assert.match(text,/tcc_collector_read_success 0/);assert.doesNotMatch(text,/sensitive|tcc_committed/);}finally{await new Promise(r=>s.close(r));}
});
