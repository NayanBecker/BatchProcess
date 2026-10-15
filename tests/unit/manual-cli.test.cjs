require('ts-node/register');const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
test('missing/open config and malformed manual arguments reject before pool or global database imports',async()=>{
 const {manualCommand}=require('../../src/cli/manual');const load=Module._load;let imports=0;
 Module._load=function(request,...args){if(request==='knex'||request.includes('db/conection')){imports++;throw Error('DB imported');}return load.call(this,request,...args);};
 try{
   await assert.rejects(manualCommand(['run']),/configuração/);
   await assert.rejects(manualCommand(['check-config','--config','config/clone.example.json','--confirm','']),/configuração/);
   assert.match(await manualCommand(['--help']),/clone LOCAL/);assert.equal(imports,0);
   const fs=require('node:fs');const read=fs.readFileSync;
   const config={connection:{host:'127.0.0.1',port:65534,database:'test_only_clone',user:'test_only'},target:{database:'test_only_clone',dataSchema:'test_data',controlSchema:'test_control',tables:['teste_socios','teste_destino','teste_migracao']},allowlist:['test_only_clone/test_data/test_control'],customSchemas:true,maxRows:1000};
   fs.readFileSync=function(path,...args){return path==='test-only-config.json'?JSON.stringify(config):read.call(this,path,...args);};
   const flags=['--config','test-only-config.json','--confirm','test_only_clone/test_data/test_control','--operation','EXP-06','--dataset','test-only'];
   try {
     assert.deepEqual(await manualCommand(['check-config',...flags]),{valid:true,target:'test_only_clone/test_data/test_control',connectionOpened:false});
     await assert.rejects(manualCommand(['run',...flags,'--mode','B','--check-token','a'.repeat(64),'--batch-size','2147483647']),/batchSize/);
     await assert.rejects(manualCommand(['run',...flags,'--mode','B','--check-token','a'.repeat(64),'--statement-timeout-ms','2147483648']),/Timeout/);
     await assert.rejects(manualCommand(['run',...flags,'--mode','B','--check-token','a'.repeat(64),'--throttle-ms','2147483648']),/throttleMs/);
     await assert.rejects(manualCommand(['status',...flags,'--id','0']),/ID/);
     await assert.rejects(manualCommand(['run',...flags,'--mode','B']),/check/);
     await assert.rejects(manualCommand(['restore',...flags]),/retirada/);
     assert.equal(imports,0);
   } finally {fs.readFileSync=read;}
 }finally{Module._load=load;}
});
