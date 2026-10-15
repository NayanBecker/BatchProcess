// Single owned process: stopping the tracked process must stop the HTTP listener.
'use strict';
require('../dist/db/config');
const config=require('./collector.config.json');
const {createReader,createServer}=require('./collector.cjs');
let reader;
try {reader=createReader(config,process.env[config.connection.passwordEnv]||process.env.DB_PASSWORD);}
catch {console.error('Collector configuration rejected; credentials suppressed');process.exit(1);}
const server=createServer(reader.read);
server.on('error',async()=>{console.error('Collector listener unavailable; credentials suppressed');await reader.pool.end();process.exitCode=1;});
server.listen(config.port||9464,config.bind||'127.0.0.1',()=>console.log('TCC collector ready (single owned process)'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>reader.pool.end()));
