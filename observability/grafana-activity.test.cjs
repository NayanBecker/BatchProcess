'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
test('activity datasource uses existing selected identity with a bounded pool and no default override',()=>{
 const {datasourceConfig}=require('./configure-grafana-activity.cjs');
 const d=datasourceConfig({host:'127.0.0.1',port:5432,database:'selected',user:'existing'},'memory-only');
 assert.equal(d.uid,'batcheman-postgres');assert.equal(d.type,'grafana-postgresql-datasource');
 assert.equal(d.url,'host.docker.internal:5432');assert.equal(d.user,'existing');assert.equal(d.isDefault,false);
 assert.equal(d.jsonData.database,'selected');assert.equal(d.jsonData.maxOpenConns,1);assert.equal(d.jsonData.maxIdleConns,1);
 assert.equal(d.secureJsonData.password,'memory-only');assert.equal(d.jsonData.password,undefined);
});
