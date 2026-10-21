require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const {spawnSync}=require('node:child_process');

test('removed result tools reject at CLI/API boundary before database imports or context access',async()=>{
 const load=Module._load;let imports=0;
 Module._load=function(request,...args){
  if(request==='knex'||request.includes('db/conection')){imports++;throw Error('database import forbidden');}
  return load.call(this,request,...args);
 };
 try {
  const {manualCommand,manualHelp}=require('../../src/cli/manual');
  const {fixtureCommand,fixtureHelp}=require('../../src/cli/fixture');
  const {reviewAction}=require('../../src/experiments/reviewRunner');
  const context=new Proxy({},{get(){throw Error('context accessed before rejection');}});
  for(const action of ['validate','restore']) {
   await assert.rejects(manualCommand([action]),/retirad/i);
   await assert.rejects(fixtureCommand([action]),/retirad/i);
   await assert.rejects(reviewAction(context,action,{}),/retirad/i);
   const result=spawnSync(process.execPath,['scripts/backup-review.cjs',action],{encoding:'utf8'});
   assert.equal(result.status,1);assert.match(result.stderr,/retirad/i);
   for(const command of ['manual','fixture']) {
    const compiled=spawnSync(process.execPath,['dist/research/cli.js',command,action],{encoding:'utf8',env:{...process.env,DB_NAME:'',DB_USER:'',DB_PASSWORD:''}});
    assert.equal(compiled.status,1);assert.match(compiled.stderr,/retirad/i);
   }
  }
  const fs=require('node:fs');
  assert.equal(fs.existsSync('src/experiments/restore.ts'),false);
  assert.equal(fs.existsSync('dist/experiments/restore.js'),false);
  assert.doesNotMatch(fs.readFileSync('src/experiments/reviewRunner.ts','utf8'),/resetConfirmation|divergences|validated:true|\.delete\(\)/);
  assert.doesNotMatch(manualHelp,/\b(validate|restore)\b/);
  assert.doesNotMatch(fixtureHelp,/\b(validate|restore)\b/);
  assert.equal(imports,0);
 } finally {Module._load=load;}
});
