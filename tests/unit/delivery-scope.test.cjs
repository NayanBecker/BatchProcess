const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function sources(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('SQL delivery excludes historical laboratory and compiled commands',()=>{
 for(const name of ['archive','research','experiments','scripts','config','.hermes','STATUS-TCC.md','src/experiments','src/research','src/jobs','src/cli/fixture.ts','src/cli/manual.ts','examples/legacy','dist/experiments','dist/research','dist/jobs','dist/cli/fixture.js','dist/cli/manual.js']) assert.equal(fs.existsSync(name),false,name);
 for(const file of sources('src').filter(p=>p.endsWith('.ts')))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/(?:from\s*|require\()['"][^'"]*(?:experiments\/|research\/)/,file);
 assert.ok(fs.existsSync('jobs/normalize-label.sql'));assert.ok(fs.existsSync('jobs/converter-cnpj.sql'));
 assert.ok(fs.existsSync('observability/compose.yaml'),'active optional monitor mounts retained');
});
