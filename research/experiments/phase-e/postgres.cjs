'use strict';
const {Pool}=require('pg');
const {assertSchema}=require('./fixture.cjs');
function createReadWorkload(connection,schema,{concurrency,timeoutMs,profile='read'}){
 if(connection.database!=='tcc_framework_test')throw Error('Somente tcc_framework_test');
 assertSchema(schema);
 if(!['read','write'].includes(profile)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>8)throw Error('Limites inválidos');
 const common={host:connection.host,port:connection.port,user:connection.user,password:connection.password,database:connection.database,connectionTimeoutMillis:timeoutMs,options:`-c statement_timeout=${timeoutMs}${profile==='read'?' -c default_transaction_read_only=on':''}`,application_name:'tcc-phase-e-'+profile};
 const pool=new Pool({...common,max:concurrency}),cancelPool=new Pool({...common,max:1});
 pool.on('error',()=>{});cancelPool.on('error',()=>{});
 async function execute(req,signal,testQuery){
  let client,cancelling=Promise.resolve(),destroy=false;
  const abort=()=>{if(client)cancelling=(async()=>{let cancel;try{cancel=await cancelPool.connect();const actual=await cancel.query('SELECT current_database() AS database');if(actual.rows[0].database!=='tcc_framework_test')throw Error('Destino real recusado');await cancel.query('SELECT pg_cancel_backend($1)',[client.processID]);}catch{destroy=true;}finally{cancel?.release();}})();};
  try{
   client=await pool.connect();
   if(signal.aborted)throw Object.assign(Error('deadline'),{timeout:true});
   signal.addEventListener('abort',abort,{once:true});
   // The actual session is checked too, not only the configured database.
   const current=await client.query('SELECT current_database() AS database');
   if(current.rows[0].database!=='tcc_framework_test')throw Error('Destino real recusado');
   if(signal.aborted)throw Object.assign(Error('deadline'),{timeout:true});
   const result=await client.query(testQuery?{text:testQuery}:{text:profile==='write'?`UPDATE "${schema}".source SET load_counter=load_counter+1 WHERE id=$1`:`SELECT id,processado FROM "${schema}".source WHERE id=$1`,values:[req.id]});
   if(!testQuery&&result.rowCount!==1)throw Error('Unexpected row count');
   return {returnedRows:result.rowCount};
  }catch(error){if(error.code==='57014'||signal.aborted||/connection timeout/.test(error.message))throw Object.assign(Error('deadline'),{timeout:true});throw Object.assign(Error('read-failed'),{code:error.code});}
  finally{signal.removeEventListener('abort',abort);await cancelling;if(client)client.release(destroy);}
 }
 return {pool,execute,close:async()=>{await pool.end();await cancelPool.end();}};
}
module.exports={createReadWorkload};
