require('ts-node/register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {readRuntimePassword}=require('../../src/core/runtimeConfig');

test('public password reads only the selected key from .env beside the config, without exporting variables',()=>{
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'batcheman-env-'));
 const name='BATCHEMAN_PASSWORD_TEST_ONLY';
 const previous=process.env[name];
 delete process.env[name];
 try {
  fs.writeFileSync(path.join(dir,'.env'),`${name}="synthetic # quoted password"\nBATCHEMAN_UNUSED_TEST_ONLY=not-exported\n`);
  const runtime={connection:{passwordEnv:name}};
  assert.equal(readRuntimePassword(runtime,path.join(dir,'custom.json')),'synthetic # quoted password');
  assert.equal(process.env[name],undefined);
  assert.equal(process.env.BATCHEMAN_UNUSED_TEST_ONLY,undefined);
  process.env[name]='explicit-environment';
  assert.equal(readRuntimePassword(runtime,path.join(dir,'custom.json')),'explicit-environment');
  delete process.env[name];
  fs.unlinkSync(path.join(dir,'.env'));
  assert.throws(()=>readRuntimePassword(runtime,path.join(dir,'custom.json')),/passwordEnv.*\.env/);
 } finally {
  if(previous===undefined) delete process.env[name]; else process.env[name]=previous;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
