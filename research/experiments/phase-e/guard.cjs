'use strict';
const {Client}=require('pg');
async function acquirePilotGuard(connection){
 if(connection.database!=='tcc_framework_test')throw Error('Somente tcc_framework_test');
 const client=new Client({host:connection.host,port:connection.port,user:connection.user,password:connection.password,database:connection.database,connectionTimeoutMillis:4000,application_name:'tcc-phase-e-guard'});
 try{
  await client.connect();
  const actual=await client.query('SELECT current_database() AS database');
  if(actual.rows[0].database!=='tcc_framework_test')throw Error('Destino real recusado');
  const lock=await client.query('SELECT pg_try_advisory_lock(424242,9465) AS acquired');
  if(!lock.rows[0].acquired)throw Error('Pilot already running');
  let released=false;
  return async()=>{if(!released){released=true;await client.end();}};
 }catch(error){await client.end();throw error;}
}
module.exports={acquirePilotGuard};
