'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {collectorSettings}=require('./collector-runtime.cjs');
test('container transport maps only loopback and keeps selected connection/schema unchanged',()=>{
 for(const host of ['127.0.0.1','localhost','::1','remote.example']){
  const runtime={connection:{host,port:5432,database:'chosen',user:'chosen',passwordEnv:'CHOSEN_PASSWORD'},target:{controlSchema:'chosen_control'}};
  const before=JSON.stringify(runtime);
  const container=collectorSettings(runtime,{port:9464,bind:'127.0.0.1'},{BATCHEMAN_COLLECTOR_CONTAINER:'1'});
  assert.equal(container.connection.host,host==='remote.example'?host:'host.docker.internal');
  assert.equal(container.bind,'0.0.0.0');assert.equal(container.port,9464);
  assert.equal(container.controlSchema,'chosen_control');
  assert.equal(container.connection.passwordEnv,'CHOSEN_PASSWORD');
  assert.equal(JSON.stringify(runtime),before);
  const native=collectorSettings(runtime,{port:9464,bind:'127.0.0.1'},{});
  assert.equal(native.connection.host,host);assert.equal(native.bind,'127.0.0.1');
 }
});
