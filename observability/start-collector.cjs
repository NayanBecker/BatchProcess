// Single owned process: stopping the tracked process must stop the HTTP listener.
'use strict';
const configFile=process.argv[2]||'batcheman.config.local.json';
const {readRuntimeConfig,readRuntimePassword}=require('../dist/core/runtimeConfig');
const listener=require('./collector.config.json');
const {createReader,createServer}=require('./collector.cjs');
const {collectorSettings}=require('./collector-runtime.cjs');
let reader,config;
try {
 const runtime=readRuntimeConfig(configFile);
 config=collectorSettings(runtime,listener);
 reader=createReader(config,readRuntimePassword(runtime,configFile));
}
catch {console.error('Collector configuration rejected; credentials suppressed');process.exit(1);}
const server=createServer(reader.read);
server.on('error',async()=>{console.error('Collector listener unavailable; credentials suppressed');await reader.pool.end();process.exitCode=1;});
server.listen(config.port,config.bind,()=>console.log('TCC collector ready (read-only)'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>reader.pool.end()));
