#!/usr/bin/env node
// Local authorized small review only. Never prints passwords or domain records.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
process.chdir(root);
const [action,operation='EXP-06',mode='B',id]=process.argv.slice(2);
if(['validate','restore'].includes(action)){console.error('Ferramenta de resultado retirada do framework e deste wrapper.');process.exit(1);}
const target='backup_testes/review_data/benchmark_control';
const datasets={'EXP-06':'backup-local-06-v1','EXP-08':'backup-local-08-v1','EXP-09':'backup-local-09-v1'};
if(!['prepare-data','check-config','check','prepare','mark','run','status','list'].includes(action)||!datasets[operation]||(action==='run'&&!['A','B'].includes(mode))) {
 console.error('Uso: node scripts/backup-review.cjs prepare-data|check-config|check|prepare|mark|run|status|list [EXP-06|EXP-08|EXP-09] [A|B] [ID]');process.exit(1);
}
if(action==='prepare-data') {
 const r=spawnSync('docker',['exec','-i','dbpostgres','psql','-X','-U','postgres','-d','backup_testes','-v','ON_ERROR_STOP=1'],{input:fs.readFileSync(path.join(__dirname,'prepare-backup-review.sql')),encoding:'utf8'});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);
}
// The app's existing native loader loads credentials without opening a pool.
// Only this wrapper maps the app password to the explicitly named review variable.
require('../dist/db/config');
const env={...process.env,BATCH_REVIEW_PASSWORD:process.env.BATCH_REVIEW_PASSWORD||process.env.DB_PASSWORD};
const base=['manual','--config','config/backup_testes.json','--confirm',target,'--operation',operation,'--dataset',datasets[operation]];
function cli(command,extra=[]) {
 const args=[base[0],command,...base.slice(1),...extra];
 const r=spawnSync(process.execPath,['dist/cli/index.js',...args],{cwd:root,env,encoding:'utf8'});
 if(r.status!==0){console.error(`CLI ${command} recusou a ação (exit ${r.status??1}); parar, verificar configuração/estado sem imprimir dados de domínio. Nenhum reset automático.`);process.exit(r.status??1);}
 const lines=r.stdout.trim().split(/\r?\n/);let result;
 try{result=JSON.parse(lines.at(-1));}catch{console.error('Saída CLI não reconhecida');process.exit(1);}
 return result;
}
let extra=[];
if(['prepare','mark','run'].includes(action)) {
 const checked=cli('check');console.log(JSON.stringify({action:'check',...checked}));
 extra.push('--check-token',checked.checkToken);
}
if(action==='run')extra.push('--mode',mode,'--batch-size','7');
if(action==='status') {
 if(!id||!/^\d+$/.test(id)){console.error('ID explícito: ... status EXP-06 B 1');process.exit(1);}
 extra.push('--id',id);
}
const result=cli(action,extra);
if(action==='run')console.log(JSON.stringify({action,operation,dataset:datasets[operation],id:result.id,status:result.status}));
else if(action==='status')console.log(JSON.stringify({action,id:result.id,status:result.status}));
else console.log(JSON.stringify({action,...(Array.isArray(result)?{jobs:result}:result)}));
