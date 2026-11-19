const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
function cli(...args){return spawnSync(process.execPath,['-r','ts-node/register','src/cli/index.ts',...args],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});}
test('public help requires no database and presents register/run rather than laboratory UX',()=>{
 const r=cli('--help'); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/BatCheman/);assert.match(r.stdout,/register/); assert.doesNotMatch(r.stdout,/fixture|manual|EXP-/);
});
test('configured catalog lists only declared jobs, without credentials or database imports',()=>{
 const r=cli('jobs','list','--config','batcheman.config.example.json');assert.equal(r.status,0,r.stderr);const jobs=JSON.parse(r.stdout);assert.deepEqual(jobs.map(j=>j.name),['normalize-label','converter-cnpj']);assert.ok(jobs.every(j=>j.sqlFile&&!j.module));assert.doesNotMatch(r.stdout,/EXP-|Socio|password/);
});
test('retired actions and invalid ids fail before reading configuration',()=>{
 for(const args of [['restore'],['run','0'],['run','1','--mode','other']]){const r=cli(...args);assert.equal(r.status,1);assert.doesNotMatch(r.stderr,/ENOENT|password|DB_/);}
});
