'use strict';
// Container transport only: never change the operator's selected runtime config.
function collectorSettings(runtime,listener,env=process.env){
 const container=env.BATCHEMAN_COLLECTOR_CONTAINER==='1';
 const connection={...runtime.connection};
 if(container&&['localhost','127.0.0.1','::1'].includes(connection.host))connection.host='host.docker.internal';
 return {connection,controlSchema:runtime.target.controlSchema,port:listener.port||9464,bind:container?'0.0.0.0':listener.bind||'127.0.0.1'};
}
module.exports={collectorSettings};
