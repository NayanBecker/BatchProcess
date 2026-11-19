'use strict';
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
function datasourceConfig(c,password){
 const host=['127.0.0.1','localhost','::1'].includes(c.host)?'host.docker.internal':c.host;
 return {uid:'batcheman-postgres',name:'BatCheman PostgreSQL — consultas atuais',type:'grafana-postgresql-datasource',access:'proxy',url:`${host}:${c.port}`,user:c.user,isDefault:false,editable:false,
  jsonData:{database:c.database,sslmode:'disable',maxOpenConns:1,maxIdleConns:1,maxIdleConnsAuto:false,connMaxLifetime:60,postgresVersion:1700,timescaledb:false},secureJsonData:{password}};
}
function api(method,route,payload){
 const password=fs.readFileSync(path.join(__dirname,'local/grafana-password'),'utf8').trim();
 return new Promise((resolve,reject)=>{
  const body=payload===undefined?undefined:JSON.stringify(payload);
  const req=http.request({hostname:'127.0.0.1',port:3000,path:route,method,auth:`admin:${password}`,timeout:10000,headers:body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{}},res=>{
   let data='';res.on('data',d=>data+=d);res.on('end',()=>{try{const value=JSON.parse(data);if(res.statusCode>=400)reject(new Error(`Grafana HTTP ${res.statusCode}`));else resolve(value);}catch{reject(new Error('Grafana response rejected'));}});
  });req.on('timeout',()=>req.destroy(new Error('Grafana timeout')));req.on('error',()=>reject(new Error('Grafana connection failed')));req.end(body);
 });
}
async function configure(file){
 const {readRuntimeConfig,readRuntimePassword}=require('../dist/core/runtimeConfig');
 const runtime=readRuntimeConfig(file);const c=runtime.connection;const password=readRuntimePassword(runtime,file);
 const {Client}=require('pg');const {passwordEnv,...connection}=c;
 const client=new Client({...connection,password,connectionTimeoutMillis:3000,statement_timeout:3000,application_name:'tcc_observability_readonly'});
 let version;
 try{await client.connect();const r=await client.query("SELECT current_setting('server_version_num')::integer AS version, current_database() AS db, current_user AS role");
  if(r.rows[0].db!==c.database||r.rows[0].role!==c.user||r.rows[0].version<140000)throw new Error('PostgreSQL identity/version rejected');version=r.rows[0].version;
 }finally{await client.end();}
 const ds=datasourceConfig(c,password);ds.jsonData.postgresVersion=Math.floor(version/10000)*100;
 const existing=(await api('GET','/api/datasources')).find(d=>d.uid===ds.uid);
 await api(existing?'PUT':'POST',existing?`/api/datasources/uid/${ds.uid}`:'/api/datasources',ds);
 const saved=await api('GET',`/api/datasources/uid/${ds.uid}`);
 if(!saved.secureJsonFields?.password||saved.isDefault||saved.jsonData.maxOpenConns!==1||saved.user!==c.user||saved.jsonData.database!==c.database)throw new Error('Datasource verification failed');
 const health=await api('GET',`/api/datasources/uid/${ds.uid}/health`);if(health.status!=='OK')throw new Error('Datasource unhealthy');
 await api('POST','/api/admin/provisioning/dashboards/reload',{});
 const applied=await api('GET','/api/dashboards/uid/tcc-phase-d');
 if(applied.dashboard.panels.length!==11||!applied.dashboard.panels.some(p=>p.id===11&&p.datasource.uid===ds.uid))throw new Error('Dashboard reload verification failed');
 const target=applied.dashboard.panels.find(p=>p.id===11).targets[0];
 const result=await api('POST','/api/ds/query',{from:String(Date.now()-60000),to:String(Date.now()),queries:[{...target,datasource:{type:ds.type,uid:ds.uid},intervalMs:30000,maxDataPoints:50}]});
 const r=result.results?.A;if(!r||r.error||r.status>=400)throw new Error('Activity query failed');
 console.log(JSON.stringify({dashboardUID:applied.dashboard.uid,panels:applied.dashboard.panels.length,datasourceUID:saved.uid,health:health.status,postgresVersion:version,securePasswordStored:saved.secureJsonFields.password,queryStatus:r.status,frames:(r.frames||[]).map(f=>({columns:f.schema.fields.map(v=>({name:v.name,type:v.type})),rows:f.data.values[0]?.length||0}))}));
 console.log('Existing database role reused; no database privileges changed. This datasource is NOT an enforced read-only account.');
}
module.exports={datasourceConfig,api};
if(require.main===module){
 if(!process.argv.includes('--use-existing-role')){console.error('Requires --use-existing-role: Grafana can execute arbitrary SQL with this existing role. Prefer a pre-authorized restricted monitoring role.');process.exitCode=1;}
 else configure(process.argv[2]||'batcheman.config.local.json').catch(()=>{console.error('Activity datasource setup/verification failed; credentials and SQL suppressed');process.exitCode=1;});
}
