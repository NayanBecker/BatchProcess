require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateRuntimeConfig}=require('../../src/core/runtimeConfig');
const example=require('../../batcheman.config.example.json');
function config(){return structuredClone(example);}
test('runtime config rejects inline secrets, unsafe control schemas, unbound modules and overlong identifiers',()=>{
 for(const change of [c=>c.connection.password='forbidden',c=>c.jobs['normalize-label'].password='forbidden',c=>c.target.password='forbidden',c=>c.target.controlSchema='public',c=>c.target.controlSchema=c.target.dataSchema,c=>c.jobs['normalize-label'].module='../../evil',c=>c.jobs['normalize-label'].table='x'.repeat(64),c=>c.target.database='elsewhere']){const c=config();change(c);assert.throws(()=>validateRuntimeConfig(c));}
 assert.equal(validateRuntimeConfig(config()).target.dataSchema,'public');
});
test('init rejects context/config misbinding before opening a transaction',async()=>{
 const {initialize}=require('../../src/cli/public');let opened=0;
 await assert.rejects(()=>initialize({db:{transaction(){opened++;throw Error('opened');}},schema:'other_control',dataSchema:'public',runtime:config()}),/Contexto/);
 assert.equal(opened,0);
});
