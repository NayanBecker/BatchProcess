'use strict';
const http=require('node:http');
const validName=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(value);
const escapeLabel=value=>String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/"/g,'\\"');
const rank=row=>row.status==='running'?0:['pending','paused'].includes(row.status)?1:2;
const ordered=rows=>[...rows].sort((a,b)=>rank(a)-rank(b)||Number(b.id||0)-Number(a.id||0));
const statuses=['pending','running','paused','completed','failed','cancelled'];
function render(rows){
 const groups=new Map();
 const accepted=[];
 for(const row of ordered(rows).slice(0,200)){const s=row.transactional_state;if(!s||!validName(s.operation)||!['A','B'].includes(s.mode)||!statuses.includes(row.status)||!/^\d+$/.test(String(row.error_count??0))||!['visited','changed','inserted','deleted','commits'].every(n=>/^\d+$/.test(String(s[n]))))continue;
 accepted.push(row);
 const key=s.operation+'|'+s.mode;
 if(!groups.has(key))groups.set(key,{operation:s.operation,mode:s.mode,counts:{},values:{visited:0n,changed:0n,inserted:0n,deleted:0n,commits:0n,errors:0n},active:0,paused:0,timing:0,uncertain:0});
 const g=groups.get(key);g.counts[row.status]=(g.counts[row.status]||0)+1;
 for(const n of ['visited','changed','inserted','deleted','commits']){if(!/^\d+$/.test(String(s[n])))throw Error('Invalid durable count');g.values[n]+=BigInt(s[n]);}
 g.values.errors+=BigInt(row.error_count||0);
 const m=s.observability;
 if(m?.version===1){
  if(!g.observed)g.observed={jobs:0,attempts:0,failures:0,samples:0,unresolved:0,work_seconds:0,cpu_seconds:0,rss_sample_max_bytes:0,visited:0n,changed:0n,inserted:0n,deleted:0n};
  const o=g.observed;o.jobs++;
  for(const n of ['attempts','failures','samples','workSeconds','cpuSeconds','rssSampleMaxBytes'])if(!Number.isFinite(m[n])||m[n]<0)throw Error('Invalid observation');
  for(const n of ['attempts','failures','samples'])if(!Number.isSafeInteger(m[n]))throw Error('Invalid observation count');
  if(m.samples+m.failures>m.attempts)throw Error('Inconsistent observation');
  for(const n of ['attempts','failures','samples'])o[n]+=m[n];
  o.unresolved+=m.attempts-m.samples-m.failures;o.work_seconds+=m.workSeconds;o.cpu_seconds+=m.cpuSeconds;o.rss_sample_max_bytes=Math.max(o.rss_sample_max_bytes,m.rssSampleMaxBytes);
  for(const n of ['visited','changed','inserted','deleted']){if(!/^\d+$/.test(m[n]))throw Error('Invalid observed count');o[n]+=BigInt(m[n]);}
 }
 if(s.timing && Number.isFinite(s.timing.activeMs)&&Number.isFinite(s.timing.pausedMs)){g.active+=s.timing.activeMs/1000;g.paused+=s.timing.pausedMs/1000;g.timing++;if(s.timing.uncertain)g.uncertain++;}
 }
 let out='';const metric=(name,help,samples)=>{out+=`# HELP ${name} ${help}\n# TYPE ${name} gauge\n`+samples.join('\n')+'\n';};
 const gs=[...groups.values()].sort((a,b)=>a.operation.localeCompare(b.operation)||a.mode.localeCompare(b.mode));const labels=g=>`operation="${escapeLabel(g.operation)}",mode="${g.mode}"`;
 metric('tcc_jobs','Current selected durable jobs by status; selection at most 200 jobs, not event counters.',gs.flatMap(g=>statuses.map(status=>`tcc_jobs{${labels(g)},status="${status}"} ${g.counts[status]||0}`)));
 for(const n of ['visited','changed','inserted','deleted','commits','errors'])metric('tcc_committed_'+n,'Sum of selected committed state (at most 200 jobs); may decrease on selection changes or history deletion. Not a counter.',gs.map(g=>`tcc_committed_${n}{${labels(g)}} ${g.values[n]}`));
 for(const [name,field]of [['active_seconds','active'],['paused_seconds','paused'],['timing_jobs','timing'],['timing_uncertain_jobs','uncertain']])metric('tcc_'+name,'Persisted timing only; no extrapolation between checkpoints.',gs.filter(g=>g.timing).map(g=>`tcc_${name}{${labels(g)}} ${g[field]}`));
 const observed=gs.filter(g=>g.observed);
 for(const n of ['jobs','attempts','failures','samples','unresolved','work_seconds','cpu_seconds','rss_sample_max_bytes','visited','changed','inserted','deleted'])metric('tcc_batch_retained_'+n,'Instrumented retained history gauge only. Work ends before checkpoint; CPU process-wide; RSS boundary-sample maximum. No rate.',observed.map(g=>`tcc_batch_retained_${n}{${labels(g)}} ${g.observed[n]}`));
 const individual=accepted.filter(r=>Number.isSafeInteger(r.id)&&r.id>0&&validName(r.job_name)).slice(0,20);
 const jobLabels=r=>`job_id="${r.id}",job_name="${escapeLabel(r.job_name)}",status="${r.status}",mode="${r.transactional_state.mode}"`;
 metric('batcheman_job_info','At most 20 jobs, running first then recent IDs. Value 1 identifies the job.',individual.map(r=>`batcheman_job_info{${jobLabels(r)}} 1`));
 for(const n of ['visited','changed','commits','errors'])metric('batcheman_job_'+n,'Committed snapshot per selected job; gauge, never rate.',individual.map(r=>`batcheman_job_${n}{${jobLabels(r)}} ${n==='errors'?r.error_count||0:r.transactional_state[n]}`));
 metric('batcheman_job_batch_work_seconds','Mean observed committed batch work, excludes checkpoint, commit and throttle; missing if not instrumented.',individual.filter(r=>r.transactional_state.observability?.version===1&&r.transactional_state.observability.samples>0).map(r=>`batcheman_job_batch_work_seconds{${jobLabels(r)}} ${r.transactional_state.observability.workSeconds/r.transactional_state.observability.samples}`));
 return out;
}
function createReader(config,password){
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(config.controlSchema)||!config.connection.database||!config.connection.passwordEnv)throw Error('Explicit configuration required');
 const {Pool}=require('pg');const {passwordEnv,...connection}=config.connection;
 if(!password)throw Error('Configured password variable missing');
 const pool=new Pool({...connection,password,max:1,connectionTimeoutMillis:3000,statement_timeout:3000,application_name:'tcc_observability_readonly'});
 return {pool,read:async()=>{const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const identity=await c.query('SELECT current_database() AS db');if(identity.rows[0].db!==connection.database)throw Error('Target mismatch');const r=await c.query(`SELECT id,job_name,status,error_count,transactional_state - 'sqlDefinition' AS transactional_state FROM "${config.controlSchema}".batch_jobs ORDER BY CASE WHEN status='running' THEN 0 WHEN status IN ('pending','paused') THEN 1 ELSE 2 END,id DESC LIMIT 200`);await c.query('COMMIT');return r.rows;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}};
}
function createServer(read){let inflight;const cpuStart=process.cpuUsage();return http.createServer(async(req,res)=>{
 if(req.url!=='/metrics'&&req.url!=='/health'){res.writeHead(404).end();return;}
 const start=performance.now();let text;try{if(!inflight)inflight=read().finally(()=>{inflight=null});const rows=await inflight;text='tcc_collector_read_success 1\n'+render(rows);}catch{text='tcc_collector_read_success 0\n';}
 const cpu=process.cpuUsage(cpuStart);text+=`tcc_collector_process_cpu_seconds ${(cpu.user+cpu.system)/1e6}\ntcc_collector_process_resident_memory_bytes ${process.memoryUsage().rss}\ntcc_collector_read_seconds ${(performance.now()-start)/1000}\n`;
 res.writeHead(req.url==='/health'&&text.startsWith('tcc_collector_read_success 0')?503:200,{'Content-Type':'text/plain; version=0.0.4; charset=utf-8'}).end(text);
 });}
module.exports={render,createReader,createServer};
if(require.main===module)require('./start-collector.cjs');
