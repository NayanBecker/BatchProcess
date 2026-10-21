require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync,spawn}=require('node:child_process');
const knex=require('knex');const {databaseConfig}=require('../../src/db/config');const {withFixture,assertTestDatabase}=require('../helpers/phase-c-db.cjs');
const root=path.resolve(__dirname,'../..');
const approved='\n-- synthetic CNPJ\n'+fs.readFileSync(path.join(root,'jobs/converter-cnpj.sql'),'utf8')+' -- fim\n';
test('SQL file actual dev/dist CLI UPDATE A/B, immutable snapshot, INSERT/DELETE and checkpoint rollback',async()=>{
 const db=knex(databaseConfig());assertTestDatabase(db.client.connectionSettings.database);
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR,'batcheman-sql-'));
 try{await withFixture(db,async dataSchema=>withFixture(db,async controlSchema=>{
  await db.transaction(async trx=>{
   assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);await trx.raw('DROP SCHEMA ??',[controlSchema]);
   for(const table of ['source','dest'])await trx.schema.withSchema(dataSchema).createTable(table,t=>{t.bigInteger('id').primary();t.bigInteger('cnpj_antigo');t.text('cnpj_novo');});
   const seed=fs.readFileSync(path.join(root,'examples/sql/create-cnpj-synthetic.sql'),'utf8').replace(/public\.teste_cnpj/g,`"${dataSchema}".teste_cnpj`).replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await trx.raw(seed);
   const rows=[{id:'1',cnpj_antigo:'0'},{id:'3',cnpj_antigo:null},{id:'5',cnpj_antigo:'123',cnpj_novo:'keep'},{id:'9007199254740993',cnpj_antigo:'12345678901234'},{id:'9007199254740995',cnpj_antigo:'42'}];
   await trx('source').withSchema(dataSchema).insert(rows);
  });
  const connection=db.client.connectionSettings;const config={connection:{host:connection.host,port:Number(connection.port),user:connection.user,database:'tcc_framework_test',passwordEnv:'BATCHEMAN_FIXTURE_PASSWORD'},target:{database:'tcc_framework_test',dataSchema,controlSchema},jobs:{cnpj:{sqlFile:'cnpj.sql',table:'teste_cnpj'},copy:{sqlFile:'copy.sql',table:'source',targetTable:'dest',operation:'INSERT'},remove:{sqlFile:'remove.sql',table:'dest',operation:'DELETE'}}};
  const file=path.join(dir,'config.json');fs.writeFileSync(file,JSON.stringify(config));
  fs.writeFileSync(path.join(dir,'cnpj.sql'),approved);fs.writeFileSync(path.join(dir,'copy.sql'),'INSERT INTO dest SELECT * FROM source WHERE id>:inicio AND id<=:fim;');fs.writeFileSync(path.join(dir,'remove.sql'),'DELETE FROM dest WHERE id>:inicio AND id<=:fim;');
  const env={...process.env,BATCHEMAN_FIXTURE_PASSWORD:connection.password};
  function cli(args,dev=false,ok=true){const r=spawnSync(process.execPath,[...(dev?['-r','ts-node/register','src/cli/index.ts']:['dist/cli/index.js']),...args,'--config',file],{cwd:root,encoding:'utf8',env,timeout:30000});assert.equal(r.status,ok?0:1,r.stderr);return ok?JSON.parse(r.stdout):r;}
  cli(['init']);
  for(const [mode,dev] of [['monolithic',false],['batch',true]]){
   if(dev)await db('teste_cnpj').withSchema(dataSchema).whereNot('id','5').update({cnpj_novo:null});
   fs.writeFileSync(path.join(dir,'cnpj.sql'),approved);
   const pending=cli(['register','cnpj','--mode',mode,'--batch-size','2'],dev);assert.equal(pending.status,'pending');assert.equal(pending.highWater,'9007199254740995');
   const row=await db('batch_jobs').withSchema(controlSchema).where({id:pending.id}).first();assert.equal(row.transactional_state.sqlDefinition.text,approved);
   fs.writeFileSync(path.join(dir,'cnpj.sql'),'DELETE FROM teste_cnpj WHERE id>:inicio AND id<=:fim;');
   const done=cli(['run',String(pending.id)],dev);assert.equal(done.status,'completed');assert.equal(done.changed,'3');assert.equal(done.visited,'5');assert.equal(done.commits,dev?'3':'1');assert.equal(done.sqlHash,row.transactional_state.sqlDefinition.hash);assert.ok(!JSON.stringify(done).includes('LPAD'));
   const actual=await db('teste_cnpj').withSchema(dataSchema).orderBy('id').select('id','cnpj_novo');
   assert.deepEqual(actual,[{id:'1',cnpj_novo:'00000000000000'},{id:'3',cnpj_novo:null},{id:'5',cnpj_novo:'already-set'},{id:'9007199254740993',cnpj_novo:'12345678901234'},{id:'9007199254740995',cnpj_novo:'00000000000042'}]);
  }
  for(const [name,count] of [['copy','inserted'],['remove','deleted']]){const p=cli(['register',name,'--batch-size','2']);const d=cli(['run',String(p.id)]);assert.equal(d.status,'completed');assert.equal(d[count],'5');assert.equal(d.visited,'5');assert.equal(d.commits,'3');assert.equal((await db('dest').withSchema(dataSchema)).length,name==='copy'?5:0);}
  // A real CHECK constraint rejects the checkpoint after successful DML.
  fs.writeFileSync(path.join(dir,'cnpj.sql'),approved);await db('teste_cnpj').withSchema(dataSchema).where({id:'1'}).update({cnpj_novo:null});
  const fail=cli(['register','cnpj','--batch-size','2']);
  await db.transaction(async trx=>{
   assertTestDatabase((await trx.raw('select current_database() as database')).rows[0].database);
   await trx.raw(`ALTER TABLE ??.batch_jobs ADD CONSTRAINT reject_checkpoint CHECK (id <> ${Number(fail.id)} OR current_id = 0)`,[controlSchema]);
  });
  cli(['run',String(fail.id)],false,false);const failed=cli(['status',String(fail.id)]);assert.equal(failed.status,'failed');assert.equal(failed.commits,'0');assert.equal(failed.cursor,'0');assert.equal((await db('teste_cnpj').withSchema(dataSchema).where({id:'1'}).first()).cnpj_novo,null);
  const errors=cli(['errors',String(fail.id)]);assert.equal(errors.length,1);assert.doesNotMatch(JSON.stringify(errors),/synthetic private data|LPAD|cnpj_antigo/);
  await db.raw('ALTER TABLE ??.batch_jobs DROP CONSTRAINT reject_checkpoint',[controlSchema]);fs.unlinkSync(path.join(dir,'cnpj.sql'));
  assert.equal(cli(['recover',String(fail.id)]).status,'pending');assert.equal(cli(['run',String(fail.id)]).status,'completed');
  // Pause after first committed batch, remove source file, resume registered snapshot.
  fs.writeFileSync(path.join(dir,'cnpj.sql'),approved);const paused=cli(['register','cnpj','--batch-size','2','--throttle','1800']);
  const child=spawn(process.execPath,['dist/cli/index.js','run',String(paused.id),'--config',file],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const exited=new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
  try{let ready=false;for(let n=0;n<200;n++){const r=await db('batch_jobs').withSchema(controlSchema).where({id:paused.id}).first();if(r.status==='running'&&r.transactional_state.commits==='1'){ready=true;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(ready,true);cli(['pause',String(paused.id)]);assert.equal(await exited,0,stderr);assert.equal(JSON.parse(stdout).status,'paused');fs.unlinkSync(path.join(dir,'cnpj.sql'));assert.equal(cli(['resume',String(paused.id)]).status,'pending');const done=cli(['run',String(paused.id)]);assert.equal(done.status,'completed');assert.equal(done.visited,'5');assert.equal(done.commits,'3');}finally{if(child.exitCode===null){child.kill();await exited;}}
 }));}finally{fs.rmSync(dir,{recursive:true,force:true});await db.destroy();}
});
