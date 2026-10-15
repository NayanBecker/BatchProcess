'use strict';
const http=require('node:http');
const allowedOperations=['EXP-06','EXP-08','EXP-09'];
const statuses=['pending','running','paused','completed','failed','cancelled'];
function render(rows){
 const groups=new Map();
 for(const row of rows){const s=row.transactional_state;if(!s||!allowedOperations.includes(s.operation)||!['A','B'].includes(s.mode)||!statuses.includes(row.status))continue;
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
 const gs=[...groups.values()];const labels=g=>`operation="${g.operation}",mode="${g.mode}"`;
 metric('tcc_jobs','Current retained durable jobs by status (not event counters).',gs.flatMap(g=>statuses.map(status=>`tcc_jobs{${labels(g)},status="${status}"} ${g.counts[status]||0}`)));
 for(const n of ['visited','changed','inserted','deleted','commits','errors'])metric('tcc_committed_'+n,'Sum of retained committed state; may decrease on history deletion. Not a counter.',gs.map(g=>`tcc_committed_${n}{${labels(g)}} ${g.values[n]}`));
 for(const [name,field]of [['active_seconds','active'],['paused_seconds','paused'],['timing_jobs','timing'],['timing_uncertain_jobs','uncertain']])metric('tcc_'+name,'Persisted timing only; no extrapolation between checkpoints.',gs.filter(g=>g.timing).map(g=>`tcc_${name}{${labels(g)}} ${g[field]}`));
 const observed=gs.filter(g=>g.observed);
 for(const n of ['jobs','attempts','failures','samples','unresolved','work_seconds','cpu_seconds','rss_sample_max_bytes','visited','changed','inserted','deleted'])metric('tcc_batch_retained_'+n,'Instrumented retained history gauge only. Work ends before checkpoint; CPU process-wide; RSS boundary-sample maximum. No rate.',observed.map(g=>`tcc_batch_retained_${n}{${labels(g)}} ${g.observed[n]}`));
 return out;
}
function createReader(config,password){
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(config.controlSchema)||!config.connection.database||!config.connection.passwordEnv)throw Error('Explicit configuration required');
 const {Pool}=require('pg');const {passwordEnv,...connection}=config.connection;
 if(!password)throw Error('Configured password variable missing');
 const pool=new Pool({...connection,password,max:1,connectionTimeoutMillis:3000,statement_timeout:3000,application_name:'tcc_observability_readonly'});
 return {pool,read:async()=>{const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const identity=await c.query('SELECT current_database() AS db');if(identity.rows[0].db!==connection.database)throw Error('Target mismatch');const r=await c.query(`SELECT id,status,error_count,processed_rows,started_at,completed_at,transactional_state FROM "${config.controlSchema}".batch_jobs ORDER BY id`);await c.query('COMMIT');return r.rows;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}};
}
function createServer(read){let inflight;const cpuStart=process.cpuUsage();return http.createServer(async(req,res)=>{
 if(req.url!=='/metrics'&&req.url!=='/health'){res.writeHead(404).end();return;}
 const start=performance.now();let text;try{if(!inflight)inflight=read().finally(()=>{inflight=null});const rows=await inflight;text='tcc_collector_read_success 1\n'+render(rows);}catch{text='tcc_collector_read_success 0\n';}
 const cpu=process.cpuUsage(cpuStart);text+=`tcc_collector_process_cpu_seconds ${(cpu.user+cpu.system)/1e6}\ntcc_collector_process_resident_memory_bytes ${process.memoryUsage().rss}\ntcc_collector_read_seconds ${(performance.now()-start)/1000}\n`;
 res.writeHead(req.url==='/health'&&text.startsWith('tcc_collector_read_success 0')?503:200,{'Content-Type':'text/plain; version=0.0.4; charset=utf-8'}).end(text);
 });}
if(require.main===module){const fs=require('node:fs');const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));let reader;try{reader=createReader(config,process.env[config.connection.passwordEnv]);}catch{console.error('Collector configuration rejected (secret suppressed)');process.exit(1);}const server=createServer(reader.read);server.listen(config.port||9464,config.bind||'127.0.0.1',()=>console.log('TCC collector ready'));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>reader.pool.end()));}
module.exports={render,createReader,createServer};
