const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {db}=require('../../src/db/conection');
const {withFixture}=require('../helpers/phase-c-db.cjs');
const {BatchExecutor}=require('../../src/core/BatchExecutor');
const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
const {BatchJobModel}=require('../../src/db/models/BatchJobModel');
after(()=>db.destroy());
async function setup(schema) {
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx.raw('SET LOCAL search_path TO ??',[schema]);
    for(const n of ['001_create_batch_jobs','003_create_batch_job_logs','004_add_job_metadata','005_add_transactional_state']) await require('../../src/db/migrations/'+n).up(trx);
    await trx.schema.withSchema(schema).createTable('source',t=>{t.bigInteger('id').primary();t.integer('value');});
    await trx('source').withSchema(schema).insert([{id:'1',value:0},{id:'9',value:0},{id:'9007199254740993',value:0}]);
  });
  const context={db,schema},job=new Update({batchSize:1});
  const row=await BatchJobModel.createTransactional('Update',job.config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'increment'},context);
  return {context,job,row};
}
class Update extends TransactionalBatchJob {
  async executeBatch(c) {
    const n=await c.trx(c.table).withSchema(c.schema).where('id','>',c.lo).where('id','<=',c.hi).increment('value',1);
    return {changed:String(n),inserted:'0',deleted:'0'};
  }
}
test('shutdown aguarda DML local, pausa no limite e libera mapas sem tocar outra execução',()=>withFixture(db,async schema=>{
  const {context,row}=await setup(schema);
  const {JobManager}=require('../../src/core/JobManager');
  const {registry}=require('../../src/core/JobRegistry');
  let inside,release;
  const entered=new Promise(r=>inside=r), gate=new Promise(r=>release=r);
  class Held extends Update { async executeBatch(c) {const counts=await super.executeBatch(c);inside();await gate;return counts;} }
  registry.register('Update',Held);
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  const other=await BatchJobModel.createTransactional('Update',new Update().config,{table:'source',mode:'B',protocol:'3',dataset:'fixture',operation:'increment'},context);
  const running=manager.runQueuedTransactional(row.id,context);
  await entered;
  let finished=false;
  const stopping=manager.stop().then(()=>finished=true);
  try { await new Promise(r=>setTimeout(r,30)); assert.equal(finished,false,'stop must await owned work'); }
  finally {release();await running;await stopping;registry.unregister('Update');}
  const paused=await BatchJobModel.findById(row.id,context);
  assert.equal(paused.status,'paused');assert.equal(paused.current_id,'1');
  assert.equal((await BatchJobModel.findById(other.id,context)).status,'pending');
  assert.deepEqual(manager.getActiveWorkers(),[]);
  assert.equal(manager.getActiveExecutors().size,0);
}));
test('modo A não confirma pausa parcial solicitada durante a transação global',()=>withFixture(db,async schema=>{
  const {context}=await setup(schema);
  let inside,release;
  const entered=new Promise(r=>inside=r),gate=new Promise(r=>release=r);
  class HeldA extends Update {async executeBatch(c){const result=await super.executeBatch(c);inside();await gate;return result;}}
  const job=new HeldA();
  const row=await BatchJobModel.createTransactional('A',job.config,{table:'source',mode:'A',protocol:'3',dataset:'fixture',operation:'increment'},context);
  const run=new BatchExecutor('A',context).run(row,job);
  await entered;
  let settled=false;
  const request=BatchJobModel.requestTransactionalControl(row.id,'pause',context).then(x=>({row:x}),e=>({error:e})).then(x=>{settled=true;return x;});
  try {await new Promise(r=>setTimeout(r,30));assert.equal(settled,false);}
  finally {release();await run;}
  const result=await request;
  assert.ok(result.error,'completed A must refuse a late pause');
  const done=await BatchJobModel.findById(row.id,context);
  assert.equal(done.status,'completed');assert.equal(done.transactional_state.commits,'1');
  assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(r=>r.value),[1,1,1]);
}));
test('pedido de pausa não confirma parada; resume preserva H e contadores sem repetir DML',()=>withFixture(db,async schema=>{
  const {context,job,row}=await setup(schema);
  assert.equal(typeof BatchJobModel.requestTransactionalControl,'function');
  const executor=new BatchExecutor('first',context);
  let requested, rejected;
  executor.once('transactionalProgress',async ()=>{
    requested=await BatchJobModel.requestTransactionalControl(row.id,'pause',context);
    try { await BatchJobModel.requeueTransactional(row.id,context); } catch(e) { rejected=e; }
  });
  await executor.run(row,job);
  assert.equal(requested.status,'running');
  assert.match(rejected.message,/posse ativa/);
  const paused=await BatchJobModel.findById(row.id,context);
  assert.equal(paused.status,'paused'); assert.equal(paused.current_id,'1');
  assert.equal(paused.transactional_state.commits,'1');
  await BatchJobModel.requeueTransactional(row.id,context);
  const resumed=worker(schema,row.id,'normal');
  try { assert.equal((await message(resumed)).type,'done'); await once(resumed,'exit'); }
  finally { await kill(resumed); }
  const done=await BatchJobModel.findById(row.id,context);
  assert.equal(done.status,'completed'); assert.equal(done.transactional_state.commits,'3');
  assert.equal(done.transactional_state.highWater,'9007199254740993');
  assert.equal(done.transactional_state.changed,'3');
  assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,1,1]);
}));
test('recuperação recusa estado antigo sem protocolo de posse comprovado',()=>withFixture(db,async schema=>{
  const {context,row}=await setup(schema);
  await db.transaction(async trx=>{
    assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
    await trx('batch_jobs').withSchema(schema).where({id:row.id}).update({status:'running',worker_id:'pre-session-lock'});
  });
  await assert.rejects(BatchJobModel.requeueTransactional(row.id,context,{recover:true}),/protocolo de posse/);
}));
test('perda real da conexão de posse impede commit tardio do processo antigo', {timeout:60000},()=>withFixture(db,async schema=>{
  const {context,row}=await setup(schema);
  const child=worker(schema,row.id,'hold');
  try {
    const held=await message(child); assert.equal(held.type,'inside');
    await db.transaction(async trx=>{
      assert.equal((await trx.raw('SELECT current_database() AS name')).rows[0].name,'tcc_framework_test');
      assert.equal((await trx.raw('SELECT pg_terminate_backend(?) AS stopped',[held.pid])).rows[0].stopped,true);
    });
    // pg_terminate_backend acknowledges the signal, not completed disconnect.
    for(let i=0;i<100;i++) {
      const active=await db('pg_stat_activity').where({pid:held.pid}).first();
      if(!active) break;
      if(i===99) assert.fail('terminated backend still active');
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    await BatchJobModel.requeueTransactional(row.id,context,{recover:true});
    await new BatchExecutor('new-owner',context).run(row,new Update());
    const response=message(child); child.send('continue');
    assert.equal((await response).type,'rejected'); await once(child,'exit');
    const done=await BatchJobModel.findById(row.id,context);
    assert.equal(done.status,'completed'); assert.equal(done.transactional_state.changed,'3');
    assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,1,1]);
  } finally { await kill(child); }
}));
test('crash após commit preserva prefixo e reconcilia checkpoint em outro processo', {timeout:60000},()=>withFixture(db,async schema=>{
  const {context,row}=await setup(schema);
  const child=worker(schema,row.id,'after');
  try {
    assert.equal((await message(child)).type,'committed');
    await kill(child);
    const durable=await BatchJobModel.findById(row.id,context);
    assert.equal(durable.transactional_state.observability.failures,0);
  assert.equal(durable.transactional_state.observability.attempts,1);
  assert.equal(durable.transactional_state.observability.samples,1);
  assert.equal(durable.current_id,'1'); assert.equal(durable.transactional_state.commits,'1');
    await BatchJobModel.requeueTransactional(row.id,context,{recover:true});
    const next=worker(schema,row.id,'normal');
    try { assert.equal((await message(next)).type,'done'); await once(next,'exit'); }
    finally { await kill(next); }
    const done=await BatchJobModel.findById(row.id,context);
    assert.equal(done.transactional_state.commits,'3');
    assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,1,1]);
  } finally { await kill(child); }
}));
test('cancelamento cooperativo e delete recusam posse ativa e preservam prefixo',()=>withFixture(db,async schema=>{
  const {context,row,job}=await setup(schema);
  assert.equal(typeof BatchJobModel.deleteTransactional,'function');
  const executor=new BatchExecutor('cancel',context);
  let refusal,request;
  executor.once('transactionalProgress',async()=>{
    try { await BatchJobModel.deleteTransactional(row.id,context); } catch(e) {refusal=e;}
    request=await BatchJobModel.requestTransactionalControl(row.id,'cancel',context);
  });
  await executor.run(row,job);
  assert.match(refusal.message,/posse ativa/); assert.equal(request.status,'running');
  const stopped=await BatchJobModel.findById(row.id,context);
  assert.equal(stopped.status,'cancelled'); assert.equal(stopped.current_id,'1');
  await assert.rejects(BatchJobModel.requeueTransactional(row.id,context,{recover:true}));
  await BatchJobModel.deleteTransactional(row.id,context);
  assert.equal(await BatchJobModel.findById(row.id,context),null);
  assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,0,0]);
}));
test('manager despacha execução reenfileirada com config durável e libera slot após falha',()=>withFixture(db,async schema=>{
  const {context,row,job}=await setup(schema);
  const {registry}=require('../../src/core/JobRegistry');
  const {JobManager}=require('../../src/core/JobManager');
  registry.register('Update',Update);
  const manager=JobManager.getInstance({maxConcurrentJobs:1});
  try {
    assert.equal(typeof manager.runQueuedTransactional,'function');
    const executor=new BatchExecutor('pauser',context);
    executor.once('transactionalProgress',()=>BatchJobModel.requestTransactionalControl(row.id,'pause',context));
    await executor.run(row,job);
    await assert.rejects(manager.runQueuedTransactional(row.id,context),/pendente/);
    assert.deepEqual(manager.getActiveWorkers(),[]);
    await BatchJobModel.requeueTransactional(row.id,context);
    const completed=await manager.runQueuedTransactional(row.id,context);
    assert.equal(completed.status,'completed'); assert.equal(completed.transactional_state.commits,'3');
    assert.deepEqual(manager.getActiveWorkers(),[]);
    assert.equal(manager.getActiveExecutors().size,0);
    assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,1,1]);
  } finally { registry.unregister('Update'); }
}));
test('falha simulada na entrega da confirmação de COMMIT relê checkpoint sem duplicar prefixo',()=>withFixture(db,async schema=>{
  const {context,row,job}=await setup(schema);
  let injected=false;
  const faultDb=new Proxy(db,{get(target,key,receiver){
    if(key==='transaction') return async (...args)=>{
      const result=await target.transaction(...args);
      if(result?.state && !injected) {injected=true;throw Error('simulated lost COMMIT acknowledgement');}
      return result;
    };
    return Reflect.get(target,key,receiver);
  }});
  await assert.rejects(new BatchExecutor('uncertain',{db:faultDb,schema}).run(row,job),/simulated lost COMMIT/);
  const durable=await BatchJobModel.findById(row.id,context);
  assert.equal(durable.transactional_state.observability.failures,0);
  assert.equal(durable.transactional_state.observability.attempts,1);
  assert.equal(durable.transactional_state.observability.samples,1);
  assert.equal(durable.current_id,'1'); assert.equal(durable.transactional_state.commits,'1');
  await BatchJobModel.requeueTransactional(row.id,context,{recover:true});
  await new BatchExecutor('reconcile',context).run(row,new Update());
  const done=await BatchJobModel.findById(row.id,context);
  assert.equal(done.transactional_state.commits,'3');
  assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,1,1]);
}));
test('pedido durante DML aguarda commit do lote antes de confirmar pausa', {timeout:60000},()=>withFixture(db,async schema=>{
  const {context,row}=await setup(schema);
  const child=worker(schema,row.id,'hold');
  let request;
  try {
    assert.equal((await message(child)).type,'inside');
    let settled=false;
    request=BatchJobModel.requestTransactionalControl(row.id,'pause',context).then(r=>{settled=true;return r;});
    // Observe a real PostgreSQL lock wait, not a client-side timeout race.
    let blocked=false;
    for(let i=0;i<100;i++) {
      blocked=!!(await db('pg_stat_activity').where({datname:'tcc_framework_test',wait_event_type:'Lock'}).where('query','like',`%${schema}%`).first());
      if(blocked) break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(blocked,true); assert.equal(settled,false);
    const response=message(child); child.send('continue');
    assert.equal((await request).status,'running');
    assert.equal((await response).type,'done'); await once(child,'exit');
    const stopped=await BatchJobModel.findById(row.id,context);
    assert.equal(stopped.status,'paused'); assert.equal(stopped.current_id,'1');
    assert.equal(stopped.transactional_state.changed,'1');
    assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,0,0]);
  } finally { await kill(child); if(request) await request.catch(()=>{}); }
}));
const {fork}=require('node:child_process');
const {once}=require('node:events');
function worker(schema,id,mode) {
  return fork(require.resolve('../helpers/phase-c-worker.cjs'),[schema,String(id),mode],{
    execArgv:['-r','ts-node/register'],stdio:['ignore','ignore','pipe','ipc']
  });
}
async function message(child) {
  return Promise.race([
    once(child,'message').then(([m])=>m),
    once(child,'exit').then(()=>{throw Error('worker exited before message');})
  ]);
}
async function kill(child) {
  if(child.exitCode!==null || child.signalCode!==null) return;
  const exited=once(child,'exit'); child.kill('SIGKILL'); await exited;
}
test('crash real antes de COMMIT: exclusividade entre processos e recuperação explícita sem DML tardio', {timeout:60000},()=>withFixture(db,async schema=>{
  const {context,row}=await setup(schema);
  const child=worker(schema,row.id,'hold');
  try {
    const held=await message(child); assert.equal(held.type,'inside');
    await assert.rejects(new BatchExecutor('competitor',context).run(row,new Update()),/posse ativa/);
    await assert.rejects(BatchJobModel.requeueTransactional(row.id,context,{recover:true}),/posse ativa/);
    await kill(child);
    const durable=await BatchJobModel.findById(row.id,context);
    assert.equal(durable.status,'running'); assert.equal(durable.current_id,'0');
    assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[0,0,0]);
    await assert.rejects(BatchJobModel.requeueTransactional(row.id,context),/recuperação automática proibida/);
    await BatchJobModel.requeueTransactional(row.id,context,{recover:true});
    const next=worker(schema,row.id,'normal');
    try { assert.equal((await message(next)).type,'done'); await once(next,'exit'); }
    finally { await kill(next); }
    const done=await BatchJobModel.findById(row.id,context);
    assert.equal(done.status,'completed'); assert.equal(done.transactional_state.changed,'3');
    assert.deepEqual((await db('source').withSchema(schema).orderBy('id')).map(x=>x.value),[1,1,1]);
  } finally { await kill(child); }
}));
