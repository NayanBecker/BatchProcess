// Uses existing native env loader; never emits credentials or docker inspect/config.
const {spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
process.chdir(path.resolve(__dirname,'..'));require('../dist/db/config');
const local=path.join(__dirname,'local');fs.mkdirSync(local,{recursive:true});
const secret=path.join(local,'grafana-password');if(!fs.existsSync(secret))fs.writeFileSync(secret,require('node:crypto').randomBytes(32).toString('base64url'),{mode:0o600});
const password=process.env.TCC_MONITOR_PASSWORD||process.env.DB_PASSWORD;if(!password)throw Error('Monitoring password missing');
const env={...process.env,TCC_MONITOR_PASSWORD:password,TCC_GRAFANA_PASSWORD:fs.readFileSync(secret,'utf8')};
const action=process.argv[2];let args,cmd;
if(action==='collector'){cmd=process.execPath;args=['observability/collector.cjs','observability/collector.config.json'];}
else if(['up','down','ps'].includes(action)){cmd='docker';args=['compose','-p','tcc-observability','-f','observability/compose.yaml',...(action==='up'?['up','-d']: [action])];}
else{console.error('Usage: node observability/run.cjs collector|up|down|ps');process.exit(1);}
const r=spawnSync(cmd,args,{env,stdio:['ignore','inherit','inherit']});process.exit(r.status??1);
