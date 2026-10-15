const {db}=require('../../src/db/conection');
const {BatchExecutor}=require('../../src/core/BatchExecutor');
const {TransactionalBatchJob}=require('../../src/core/TransactionalBatchJob');
const {BatchJobModel}=require('../../src/db/models/BatchJobModel');
const {once}=require('node:events');
const [schema,id,mode]=process.argv.slice(2);
class Update extends TransactionalBatchJob {
  async executeBatch(c) {
    const n=await c.trx(c.table).withSchema(c.schema).where('id','>',c.lo).where('id','<=',c.hi).increment('value',1);
    if(mode==='hold' && c.lo==='0') {
      const pid=(await c.trx.raw('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      process.send({type:'inside',pid});
      await once(process,'message');
    }
    return {changed:String(n),inserted:'0',deleted:'0'};
  }
}
(async()=>{
  try {
    const context={db,schema};
    const row=await BatchJobModel.findById(Number(id),context);
    const executor=new BatchExecutor('child',context);
    if(mode==='after') executor.once('transactionalProgress',async()=>{
      process.send({type:'committed'});
      await once(process,'message');
    });
    await executor.run(row,new Update());
    process.send({type:'done'});
  } catch(e) { process.send({type:'rejected',message:e.message}); }
  finally { await db.destroy(); process.disconnect(); }
})();
