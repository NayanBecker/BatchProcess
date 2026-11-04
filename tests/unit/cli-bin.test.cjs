const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
test('bah is the public binary and its executable entry keeps all commands',()=>{
 const pkg=require('../../package.json');
 assert.equal(pkg.bin?.bah,'dist/cli/index.js');
 assert.ok(fs.readFileSync(path.join(root,'src/cli/index.ts'),'utf8').startsWith('#!/usr/bin/env node'));
 const r=spawnSync(process.execPath,['-r','ts-node/register','src/cli/index.ts','--help'],{cwd:root,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 for(const command of ['init','jobs list','register','run','status','logs','errors','pause','resume','cancel','recover']) assert.ok(r.stdout.includes('bah '+command),command);
});
