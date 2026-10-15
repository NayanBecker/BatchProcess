require('ts-node/register');
const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');
test('active core has no legacy item path or implicit CLI connection',()=>{
 for(const p of ['src/core/BatchExecutor.ts','src/core/BatchIterator.ts','src/core/JobManager.ts','src/core/JobRegistry.ts','src/cli/index.ts']) assert.doesNotMatch(fs.readFileSync(p,'utf8'),/processItem|\.\/BatchJob['"]|\.\.\/db\/conection|startJob\(/,p);
 assert.equal(fs.existsSync('src/core/BatchJob.ts'),false);
 assert.equal(fs.existsSync('archive/legacy-phase-c/src/core/BatchJob.ts'),true);
});
test('manager config rejects zero and fractional concurrency',()=>{
 const {JobManager}=require('../../src/core/JobManager');
 for(const maxConcurrentJobs of [0,-1,1.5]) {JobManager.instance=null; assert.throws(()=>JobManager.getInstance({maxConcurrentJobs}),/concorrência/);}
});
