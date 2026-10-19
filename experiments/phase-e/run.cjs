'use strict';
// Standalone research procedure, deliberately outside src/CLI framework.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
if(process.argv.length!==2){console.error('Uso: node experiments/phase-e/run.cjs (sem opções de destino)');process.exit(1);}
process.chdir(path.resolve(__dirname,'../..'));
const {plan,runTrial,validateConfig}=require('./pilot.cjs');
const {createMetrics}=require('./metrics.cjs');
const {sleep}=require('./load.cjs');
const c=require('./pilot.config.json');
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
async function get(url,headers){const r=await fetch(url,{headers,signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('HTTP check failed');return r.json();}
function command(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000});if(r.status!==0)throw Error('Local service command failed');return r.stdout.trim();}
function csv(rows){return rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';}
async function waitUntil(check){for(let i=0;i<30;i++){try{const value=await check();if(value)return value;}catch{}await sleep(1000);}throw Error('Monitoring readiness timeout');}
async function monitorReady(){
 command(process.execPath,['observability/run.cjs','up']);
 const id=command('docker',['ps','--filter','label=com.docker.compose.project=tcc-observability','--filter','label=com.docker.compose.service=prometheus','--format','{{.ID}}']);
 if(!/^[a-f0-9]{12,64}$/.test(id))throw Error('Prometheus identity not unique');
 command('docker',['kill','--signal','HUP',id]);
 await waitUntil(async()=>{const t=await get('http://127.0.0.1:9090/api/v1/targets');require('../../observability/targets.cjs').checkTargets(t.data.activeTargets);return t.data.activeTargets.find(t=>t.labels.job==='tcc-phase-e-load'&&t.health==='up'&&t.scrapeUrl==='http://host.docker.internal:9465/metrics');});
 const password=fs.readFileSync('observability/local/grafana-password','utf8');const headers={Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
 const expected=JSON.parse(fs.readFileSync('observability/grafana/dashboards/phase-e.json','utf8'));
 const dashboard=await waitUntil(async()=>{const d=await get('http://127.0.0.1:3000/api/dashboards/uid/tcc-phase-e',headers);return d.dashboard?.panels.length===expected.panels.length?d.dashboard:null;});
 const datasource=await get('http://127.0.0.1:3000/api/datasources/uid/tcc-prometheus',headers);assert.equal(datasource.type,'prometheus');assert.equal(datasource.url,'http://prometheus:9090');
 assert.deepEqual(dashboard.panels.map(p=>p.datasource??null),expected.panels.map(p=>p.datasource??null));
 assert.deepEqual(dashboard.panels.map(p=>(p.targets||[]).map(t=>t.expr)),expected.panels.map(p=>(p.targets||[]).map(t=>t.expr)));
 return {headers,dashboard,datasource:{uid:datasource.uid,type:datasource.type,url:datasource.url}};
}
async function exportMonitoring(dir,start,end,ready){
 const query=async expr=>get('http://127.0.0.1:9090/api/v1/query?'+new URLSearchParams({query:expr,time:String(end)}));
 const targets=await get('http://127.0.0.1:9090/api/v1/targets');json(dir+'/targets.json',targets);json(dir+'/dashboard-readback.json',ready.dashboard);json(dir+'/datasource-readback.json',ready.datasource);
 const panels=[];for(const p of ready.dashboard.panels)for(const t of p.targets||[]){const r=await query(t.expr);assert.equal(r.status,'success');panels.push({panel:p.title,expr:t.expr,missing:r.data.result.length===0,result:r.data.result});}
 json(dir+'/dashboard-queries.json',panels);
 const range=await get('http://127.0.0.1:9090/api/v1/query_range?'+new URLSearchParams({query:'{__name__=~"tcc_load_.*|up",job="tcc-phase-e-load"}',start:String(start),end:String(end),step:'1'}));assert.equal(range.status,'success');json(dir+'/prometheus-range.json',range);
 const rows=[['metric','labels','unixSeconds','value']];for(const s of range.data.result){const {__name__:name,...labels}=s.metric;for(const [ts,value]of s.values)rows.push([name,JSON.stringify(labels),ts,value]);}fs.writeFileSync(dir+'/prometheus-range.csv',csv(rows));
 const up=range.data.result.find(s=>s.metric.__name__==='up');
 const freshness=await get('http://127.0.0.1:9090/api/v1/query_range?'+new URLSearchParams({query:'timestamp(up{job="tcc-phase-e-load"})',start:String(start),end:String(end),step:'1'}));assert.equal(freshness.status,'success');json(dir+'/scrape-timestamps.json',freshness);
 const freshnessValues=freshness.data.result[0]?.values??[];
 const freshnessCoverage={uniqueScrapeTimestamps:new Set(freshnessValues.map(([,v])=>v)).size,maxSampleAgeSeconds:freshnessValues.length?Math.max(...freshnessValues.map(([grid,sample])=>grid-Number(sample))):null,missingFreshnessSeries:freshness.data.result.length===0};
 const coverage={...freshnessCoverage,startUnix:start,endUnix:end,stepSeconds:1,series:range.data.result.length,csvSamples:rows.length-1,missingPanels:panels.filter(p=>p.missing).map(p=>p.panel),upObservedSamples:up?.values.length??0,upDownSamples:up?.values.filter(([,v])=>v!=='1').length??null,upMissingGridSamples:Math.max(0,Math.floor(end-start)+1-(up?.values.length??0)),scope:'Scrape snapshots; not per-request/event timings. Missing is not zero.'};
 json(dir+'/monitoring-coverage.json',coverage);return coverage;
}
async function main(){
 validateConfig(c);
 require('../../dist/db/config');
 const {databaseConfig}=require('../../dist/db/config');const config=databaseConfig();
 if(config.connection.database!=='tcc_framework_test')throw Error('Database configuration refused');
 const knex=require('knex');const releaseGuard=await require('./guard.cjs').acquirePilotGuard(config.connection);
 const db=knex({...config,pool:{min:0,max:3,afterCreate:(client,done)=>{client.query('SELECT current_database() AS database').then(r=>done(r.rows[0].database==='tcc_framework_test'?null:Error('Destino real recusado'),client),e=>done(e,client));}},acquireConnectionTimeout:4000});
 const metrics=createMetrics();let listening=false,dir,manifest;
 try{
  const actual=await db.raw('SELECT current_database() AS database, version() AS version');assert.equal(actual.rows[0].database,'tcc_framework_test');
  await new Promise((resolve,reject)=>{metrics.server.once('error',reject);metrics.server.listen(c.metricsPort,'127.0.0.1',resolve);});listening=true;
  const ready=await monitorReady();
  dir=path.resolve('experiments/results/phase-e-'+new Date().toISOString().replaceAll(/[:.]/g,'-')+'-'+require('node:crypto').randomBytes(3).toString('hex'));fs.mkdirSync(dir,{recursive:true});
  const files=[...fs.readdirSync(__dirname).filter(n=>/\.(cjs|json)$/.test(n)).map(n=>'experiments/phase-e/'+n),...command('git',['ls-files','src']).split(/\r?\n/).filter(Boolean),'package-lock.json','tsconfig.json','tests/helpers/phase-c-db.cjs','observability/prometheus/prometheus.yml','observability/grafana/dashboards/phase-e.json'];
  const checksums=Object.fromEntries(files.map(n=>[n,require('node:crypto').createHash('sha256').update(fs.readFileSync(n)).digest('hex')]));
  const settings=(await db.raw("SELECT name,setting,unit FROM pg_settings WHERE name IN ('server_version','shared_buffers','work_mem','max_connections','synchronous_commit','fsync','full_page_writes','track_io_timing','autovacuum','checkpoint_timeout','default_transaction_isolation') ORDER BY name")).rows;
  manifest={version:1,kind:'small-functional-pilot-not-campaign',status:'running',startedAt:new Date().toISOString(),gitRevision:command('git',['rev-parse','HEAD']),worktreeDirty:command('git',['status','--porcelain']).length>0,checksums,resultDirectory:dir,config:c,plan:c.profiles.flatMap(profile=>plan({...c,profile}).map(t=>({...t,profile}))),database:'tcc_framework_test',postgresVersion:actual.rows[0].version,settings,runtime:{node:process.version,platform:process.platform,arch:process.arch,cpuCount:require('node:os').cpus().length,totalMemoryBytes:require('node:os').totalmem()},limits:{rowsMaximum:1000,concurrencyMaximum:8,profiles:c.profiles,statementTimeoutMs:c.timeoutMs,maintenanceStatementTimeoutMs:3000,maintenanceLockTimeoutMs:1000,queue:c.maxQueue},cachePolicy:'Fresh logical schema and ANALYZE then identical warmup. Physical/cache equality NOT guaranteed; no cache flush, no autovacuum/checkpoint manipulation.',trials:[],limitations:['EXP-06 synthetic small only','read and write measured separately; write updates load_counter only','3 cyclic repetitions, one batch size; matrix insufficient for Phase E closure','executor and load share Node process: batch CPU/RSS includes concurrent generator work, not isolated maintenance resources','executor interval is not DML-only protocol timer','infra exporter monitors historical backup; do not attribute its DB metrics to this fixture'],measurementStartUnix:Date.now()/1000};
  json(dir+'/manifest.json',manifest);
  let stopping=false;const stop=()=>{stopping=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
   for(const trial of manifest.plan){
    if(stopping)throw Error('Pilot interrupted after draining current trial');
    const result=await runTrial(db,{...c,profile:trial.profile},trial,metrics);
    const remaining=await db('schemata').withSchema('information_schema').where({schema_name:result.fixtureSchema});assert.equal(remaining.length,0);result.cleanup={schema:result.fixtureSchema,absent:true};
    const file=`trial-${trial.profile}-${trial.repetition}-${trial.position}-${trial.scenario}.json`;json(dir+'/'+file,result);
    const r=result.workload.records;fs.writeFileSync(dir+'/'+file.replace('.json','.csv'),csv([['index','syntheticId','scheduledMs','startedMs','finishedMs','latencyMs','outcome','censored','missing'],...r.map(x=>[x.index,x.id,x.scheduledMs,x.startedMs,x.finishedMs,x.latencyMs,x.outcome,x.censored,x.missing])]));
    manifest.trials.push({file,profile:trial.profile,cleanup:result.cleanup,scenario:trial.scenario,repetition:trial.repetition,counts:result.workload.counts,overlap:result.overlap,missingConfirmations:result.events?.missingConfirmations??null,initialStateFingerprint:result.dataset.initialStateFingerprint,integrity:result.integrity});json(dir+'/manifest.json',manifest);
    console.log(JSON.stringify({profile:trial.profile,scenario:trial.scenario,repetition:trial.repetition,...result.workload.counts,committedSamples:result.events?.committed.length??null,overlap:result.overlap}));
   }
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  manifest.measurementEndUnix=Date.now()/1000;await sleep(2200);
  const scrape=await fetch('http://127.0.0.1:9465/metrics',{signal:AbortSignal.timeout(2000)});assert.equal(scrape.status,200);const text=await scrape.text();fs.writeFileSync(dir+'/load.prom',text);
  json(dir+'/metrics-catalog.json',{source:'HTTP 127.0.0.1:9465/metrics after workload drain',names:[...new Set(text.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/[ {]/)[0]))].sort(),definitions:text.split('\n').filter(l=>/^# (HELP|TYPE)/.test(l))});
  const monitoring=await exportMonitoring(dir,manifest.measurementStartUnix,Date.now()/1000,ready);
  // Read back Prometheus counters, not just the exporter's own rendering.
  const observed=await get('http://127.0.0.1:9090/api/v1/query?'+new URLSearchParams({query:'tcc_load_offered_total'}));
  for(const profile of c.profiles)for(const scenario of ['control','A','B'])assert.equal(Number(observed.data.result.find(s=>s.metric.scenario===scenario&&s.metric.profile===profile)?.value[1]),manifest.trials.filter(t=>t.scenario===scenario&&t.profile===profile).reduce((n,t)=>n+t.counts.offered,0));
  const observedOutcomes=await get('http://127.0.0.1:9090/api/v1/query?'+new URLSearchParams({query:'tcc_load_outcomes_total'}));
  for(const profile of c.profiles)for(const scenario of ['control','A','B'])for(const outcome of ['completed','errors','timeouts','dropped'])assert.equal(Number(observedOutcomes.data.result.find(s=>s.metric.scenario===scenario&&s.metric.profile===profile&&s.metric.outcome===outcome)?.value[1]),manifest.trials.filter(t=>t.scenario===scenario&&t.profile===profile).reduce((n,t)=>n+t.counts[outcome],0));
  assert.equal(manifest.trials.length,18);assert.equal(new Set(manifest.trials.map(t=>t.initialStateFingerprint)).size,1);
  manifest.status='completed-small-pilot';manifest.finishedAt=new Date().toISOString();manifest.monitoring=monitoring;json(dir+'/manifest.json',manifest);
  console.log(JSON.stringify({resultDirectory:dir,status:manifest.status,trials:manifest.trials.length,monitoring}));
 }catch(error){if(manifest){manifest.status='failed';manifest.failure={category:error.pilotFailure??'operational-or-integrity',warmupCounts:error.counts??null};manifest.finishedAt=new Date().toISOString();json(dir+'/manifest.json',manifest);}throw error;}
 finally{if(listening)await new Promise(r=>metrics.server.close(r));await db.destroy();await releaseGuard();}
}
main().catch(()=>{console.error('Piloto interrompido/reprovado; credenciais e erros SQL suprimidos. Confira serviços, db:check e manifesto parcial.');process.exitCode=1;});
