// Operational dashboard; preserve the UID and existing bookmarked URL.
const fs=require('node:fs');const root=__dirname;
const specs=[
 ['Banco disponível','pg_up{job="postgres"}','short'],
 ['Leitura dos jobs','tcc_collector_read_success','short'],
 ['Conexões no banco','pg_stat_database_numbackends{datname="backup_testes"}','short'],
 ['Locks no banco (não duração de espera)','sum(pg_locks_count{datname="backup_testes"})','short'],
 ['Transações do banco / segundo','rate(pg_stat_database_xact_commit{datname="backup_testes"}[2m])','ops'],
 ['CPU PostgreSQL','sum(rate(container_cpu_usage_seconds_total{name="dbpostgres",cpu="total"}[2m]))','cores'],
 ['Memória PostgreSQL','container_memory_working_set_bytes{name="dbpostgres"}','bytes'],
 ['Jobs — estado e progresso confirmado','{__name__=~"batcheman_job_(visited|changed|commits|errors)"}','short'],
 ['Registros visitados — por job','batcheman_job_visited','short']
];
const panels=specs.map(([title,expr,unit],i)=>({id:i+1,title,type:i<4?'stat':i===7?'table':'timeseries',datasource:{type:'prometheus',uid:'tcc-prometheus'},maxDataPoints:600,interval:'15s',gridPos:i<4?{x:i*6,y:0,w:6,h:4}:i<7?{x:i===4?0:i===5?12:18,y:4,w:i===4?12:6,h:7}:i===7?{x:0,y:11,w:24,h:8}:{x:(i-8)*12,y:19,w:12,h:7},targets:[{refId:'A',expr,instant:i<4||i===7,range:!(i<4||i===7),legendFormat:i>=7?'{{job_name}} #{{job_id}}':'PostgreSQL'}],fieldConfig:{defaults:{unit,noValue:'Sem dados'},overrides:[]},options:i<4?{reduceOptions:{calcs:['lastNotNull'],fields:'',values:false},colorMode:'value',graphMode:'none'}:{legend:{displayMode:'list',placement:'bottom'},tooltip:{mode:'multi'}}}));
for(const p of panels.slice(0,2))p.fieldConfig.defaults.mappings=[{type:'value',options:{'0':{text:'Indisponível',color:'red'},'1':{text:'OK',color:'green'}}}];
panels[4].targets[0].legendFormat='Commit';
panels[4].targets.push({refId:'B',expr:'rate(pg_stat_database_xact_rollback{datname="backup_testes"}[2m])',legendFormat:'Rollback',range:true});
panels[5].description='Somente dbpostgres na VM Linux; não CPU do Windows.';
panels[6].description='Working set do container PostgreSQL; não memória total do Windows.';
panels[7]=require('./jobs-status-panel.cjs');
const visited=panels[8];
visited.type='barchart';
visited.description='Uma barra por execução com o total visitado no último commit. Rótulo = nome e ID do job. Consulta instantânea, sem somar amostras ao longo do tempo; pode permanecer estável enquanto um lote está executando. Até 20 jobs exportados pelo coletor.';
visited.targets=[{refId:'A',expr:'label_join(batcheman_job_visited, "execucao", " #", "job_name", "job_id")',instant:true,range:false,format:'table'}];
visited.transformations=[{id:'labelsToFields',options:{mode:'columns'}},{id:'organize',options:{excludeByName:{Time:true,__name__:true,instance:true,job:true,job_id:true,job_name:true,status:true,mode:true},indexByName:{execucao:0,batcheman_job_visited:1,Value:1},renameByName:{execucao:'Job',batcheman_job_visited:'Visitados',Value:'Visitados'}}}];
visited.fieldConfig={defaults:{unit:'locale',decimals:0,min:0,noValue:'Sem dados',color:{mode:'palette-classic'},custom:{fillOpacity:85,lineWidth:0}},overrides:[]};
visited.options={orientation:'horizontal',xField:'Job',showValue:'always',groupWidth:.75,barWidth:.8,stacking:'none',legend:{showLegend:false},tooltip:{mode:'single'}};
panels.push(require('./job-timing-panel.cjs'));
panels.push(require('./activity-panel.cjs'));
const dashboard={uid:'tcc-phase-d',title:'BatCheman — Banco e jobs',description:'Visão operacional read-only. Até 200 registros consultados e 20 jobs individuais exportados; não é todo histórico. Ausência de série é Sem dados, não zero.',schemaVersion:39,version:2,refresh:'30s',timezone:'browser',time:{from:'now-1h',to:'now'},tags:['BatCheman','Operacional'],panels};
fs.mkdirSync(root+'/grafana/dashboards',{recursive:true});fs.writeFileSync(root+'/grafana/dashboards/tcc.json',JSON.stringify(dashboard,null,2)+'\n');console.log('dashboard panels',panels.length);
