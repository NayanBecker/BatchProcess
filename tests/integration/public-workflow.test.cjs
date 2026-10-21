require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const knex=require('knex');const {databaseConfig}=require('../../src/db/config');const {withFixture,assertTestDatabase}=require('../helpers/phase-c-db.cjs');
const {initialize}=require('../../src/cli/public');
const root=path.resolve(__dirname,'../..');
test('public init refuses owned-marker schema with incompatible controls',async()=>{
 const db=knex(databaseConfig());assertTestDatabase(db.client.connectionSettings.database);
 try{await withFixture(db,async schema=>{
  await db.transaction(async trx=>{assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);await trx.raw("COMMENT ON SCHEMA ?? IS 'batcheman-control-v1'",[schema]);await trx.schema.withSchema(schema).createTable('batch_jobs',t=>t.integer('wrong'));});
  const runtime=structuredClone(require('../../batcheman.config.example.json'));runtime.connection.database=runtime.target.database='tcc_framework_test';runtime.target.controlSchema=schema;runtime.target.dataSchema='public';
  await assert.rejects(()=>initialize({db,schema,dataSchema:'public',runtime}),/incompat|controle|Controle/);
 });}finally{await db.destroy();}
});
test('public init rejects rewrite rules on otherwise compatible owned control',async()=>{
 const db=knex(databaseConfig());assertTestDatabase(db.client.connectionSettings.database);
 try{await withFixture(db,async dataSchema=>withFixture(db,async schema=>{
  const runtime=structuredClone(require('../../batcheman.config.example.json'));runtime.connection.database=runtime.target.database='tcc_framework_test';runtime.target.controlSchema=schema;runtime.target.dataSchema=dataSchema;
  const context={db,schema,dataSchema,runtime};
  await db.transaction(async trx=>{assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);await trx.raw('DROP SCHEMA ??',[schema]);});
  await initialize(context);
  await db.transaction(async trx=>{assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);await trx.schema.withSchema(dataSchema).createTable('sink',t=>t.integer('id'));await trx.raw('CREATE RULE unexpected AS ON UPDATE TO ??.batch_jobs DO ALSO INSERT INTO ??.sink(id) VALUES(1)',[schema,dataSchema]);});
  await assert.rejects(()=>initialize(context),/incompat/);
  assert.equal((await db('sink').withSchema(dataSchema)).length,0);
 }));}finally{await db.destroy();}
});
test('actual compiled and dev CLI register durable pending, run A/B, read status/logs; failure persists and rolls back',async()=>{
 const db=knex(databaseConfig());assertTestDatabase(db.client.connectionSettings.database);const dir=fs.mkdtempSync(path.join(process.env.BATCHEMAN_TEST_SCRATCH || process.env.TMPDIR || os.tmpdir(),'batcheman-public-'));
 try{await withFixture(db,async dataSchema=>withFixture(db,async controlSchema=>{
  await db.transaction(async trx=>{
   assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);
   await trx.raw('DROP SCHEMA ??',[controlSchema]);
   const seed=fs.readFileSync(path.join(root,'examples/sql/create-table-and-seed.sql'),'utf8').replace(/public\.demo_items/g,`"${dataSchema}".demo_items`).replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
   await trx.raw(seed);
  });
  const connection=db.client.connectionSettings;const config={connection:{host:connection.host,port:Number(connection.port),user:connection.user,database:'tcc_framework_test',passwordEnv:'BATCHEMAN_FIXTURE_PASSWORD'},target:{database:'tcc_framework_test',dataSchema,controlSchema},jobs:{'normalize-label':{sqlFile:path.join(root,'jobs/normalize-label.sql'),operation:'UPDATE',table:'demo_items'}}};
  const file=path.join(dir,'config.json');fs.writeFileSync(file,JSON.stringify(config));
  function cli(args,dev=false,ok=true){const r=spawnSync(process.execPath,[...(dev?['-r','ts-node/register','src/cli/index.ts']:['dist/cli/index.js']),...args,'--config',file],{cwd:root,encoding:'utf8',env:{...process.env,BATCHEMAN_FIXTURE_PASSWORD:connection.password},timeout:30000});assert.equal(r.status,ok?0:1,r.stderr);return ok?JSON.parse(r.stdout):r;}
  assert.equal(cli(['init']).initialized,true);assert.equal(cli(['init'],true).initialized,true);
  assert.equal(cli(['jobs','list']).length,1);
  for(const [mode,dev] of [['monolithic',false],['batch',true]]){
   if(mode==='batch') await db.transaction(async trx=>{assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);await trx('demo_items').withSchema(dataSchema).update({normalized_label:null});});
   const registered=cli(['register','normalize-label','--mode',mode,'--batch-size','2','--throttle','0'],dev);
   assert.equal(registered.status,'pending');assert.equal(registered.highWater,'13');assert.equal(registered.visited,'0');
   const id=String(registered.id);assert.equal(cli(['status',id]).status,'pending');
   const result=cli(['run',id],dev);assert.equal(result.status,'completed');assert.equal(result.changed,'5');assert.equal(result.commits,mode==='batch'?'3':'1');
   assert.equal(cli(['status',id]).mode,mode);assert.ok(cli(['logs',id]).some(l=>l.message==='completed'));
   assert.equal((await db('demo_items').withSchema(dataSchema).whereNull('normalized_label')).length,1);
   cli(['run',id],false,false);
   console.log(JSON.stringify({fixture:true,id:result.id,mode,rows:result.visited,commits:result.commits,status:result.status}));
  }
  async function controlled(request){
   const registered=cli(['register','normalize-label','--mode','batch','--batch-size','2','--throttle','1500']);
   const {spawn}=require('node:child_process');
   const child=spawn(process.execPath,['dist/cli/index.js','run',String(registered.id),'--config',file],{cwd:root,env:{...process.env,BATCHEMAN_FIXTURE_PASSWORD:connection.password},stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
   const exited=new Promise((resolve,reject)=>{child.once('exit',code=>resolve(code));child.once('error',reject);});
   try{
    let ready=false;
    for(let i=0;i<150;i++){
     const saved=await db('batch_jobs').withSchema(controlSchema).where({id:registered.id}).first();
     if(saved?.status==='running' && saved.transactional_state.commits==='1'){ready=true;break;}
     await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(ready,true,'worker must commit first batch before control');
    assert.ok(['running',request==='pause'?'paused':'cancelled'].includes(cli([request,String(registered.id)]).status));
    assert.equal(await exited,0,stderr);
    const stopped=JSON.parse(stdout);assert.equal(stopped.status,request==='pause'?'paused':'cancelled');assert.equal(stopped.commits,'1');
    if(request==='pause'){
     const pending=cli(['resume',String(registered.id)]);assert.equal(pending.status,'pending');assert.equal(pending.highWater,'13');assert.equal(pending.mode,'batch');
     const done=cli(['run',String(registered.id)]);assert.equal(done.status,'completed');assert.equal(done.commits,'3');assert.equal(done.visited,'6');
    }
    console.log(JSON.stringify({fixture:true,id:registered.id,control:request,status:stopped.status,commits:stopped.commits}));
   }finally{if(child.exitCode===null){child.kill();await exited;}}
  }
  await controlled('pause');await controlled('cancel');
  const fail=cli(['register','normalize-label','--batch-size','2']);
  await db.transaction(async trx=>{assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);await trx.schema.withSchema(dataSchema).alterTable('demo_items',t=>t.dropColumn('normalized_label'));});
  cli(['run',String(fail.id)],false,false);
  const failed=cli(['status',String(fail.id)]);assert.equal(failed.status,'failed');assert.equal(failed.commits,'0');assert.equal(failed.errorCount,1);assert.equal(cli(['errors',String(fail.id)]).length,1);
  const wrong=structuredClone(config);wrong.target.database=wrong.connection.database='not_the_target';fs.writeFileSync(file,JSON.stringify(wrong));cli(['init'],false,false);
 }));}finally{fs.rmSync(dir,{recursive:true,force:true});await db.destroy();}
});
