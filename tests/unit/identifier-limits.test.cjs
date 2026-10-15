require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateCloneConfig}=require('../../src/experiments/cloneConfig');
function config(dataSchema,controlSchema,database='review_clone') {return {connection:{host:'localhost',port:65534,database,user:'review'},target:{database,dataSchema,controlSchema,tables:['teste_socios','teste_destino','teste_migracao']},allowlist:[`${database}/${dataSchema}/${controlSchema}`],customSchemas:true,maxRows:1};}
test('canonical PostgreSQL identifiers reject common-prefix aliases before any connection',async()=>{
 for(const [data,control,database] of [['a'.repeat(63)+'x','a'.repeat(63)+'y','review_clone'],['ok','b'.repeat(64),'review_clone'],['ok','control','d'.repeat(64)],['é'.repeat(32),'control','review_clone']]) {
  const c=config(data,control,database);assert.throws(()=>validateCloneConfig(c,c.allowlist[0]),/identificador|Schemas|conexão/);
 }
 const {manualCommand}=require('../../src/cli/manual');const fs=require('node:fs'),Module=require('node:module');const read=fs.readFileSync,load=Module._load;let pools=0;
 Module._load=function(request,...args){if(request==='knex'){pools++;throw Error('pool imported');}return load.call(this,request,...args);};
 try {
  for(const [data,control] of [['a'.repeat(63)+'x','a'.repeat(63)+'y'],['ok','b'.repeat(64)]]) {
   const invalid=config(data,control);fs.readFileSync=function(path,...args){return path==='identifier-config.json'?JSON.stringify(invalid):read.call(this,path,...args);};
   await assert.rejects(manualCommand(['check','--config','identifier-config.json','--confirm',invalid.allowlist[0],'--operation','EXP-06','--dataset','identifiers']),/Schemas/);
  }
  assert.equal(pools,0);
 } finally {fs.readFileSync=read;Module._load=load;}
 const c=config('a'.repeat(63),'b'.repeat(63));assert.equal(validateCloneConfig(c,c.allowlist[0]),c);
 const {withTransactionalOwnership}=require('../../src/core/TransactionalOwnership');let acquisitions=0;
 const invalid=config('data','c'.repeat(64));
 await assert.rejects(withTransactionalOwnership({schema:invalid.target.controlSchema,dataSchema:'data',clone:{config:invalid,confirmation:invalid.allowlist[0]},db:{client:{acquireConnection(){acquisitions++;throw Error('pool accessed');}}}},1,()=>{}),/identificador|Schemas/);
 assert.equal(acquisitions,0);
});
test('table identifier overflow is rejected before preparation and boundary SQL',async()=>{
 const {BatchJobModel}=require('../../src/db/models');const {resolveJobConfig}=require('../../src/core/jobConfig');const {BatchIterator}=require('../../src/core/BatchIterator');let calls=0;
 const db={transaction(){calls++;throw Error('DB accessed');}};
 await assert.rejects(BatchJobModel.createTransactional('x',resolveJobConfig(),{table:'t'.repeat(64),mode:'B',protocol:'3',dataset:'x',operation:'x'},{db,schema:`phase_c_test_${'a'.repeat(32)}`}),/Tabela|identificador/);
 await assert.rejects(BatchIterator.boundary(()=>{calls++;throw Error('DB accessed');},{schema:'s',table:'t'.repeat(64)},'0','1',1),/identificador/);
 assert.equal(calls,0);
});
