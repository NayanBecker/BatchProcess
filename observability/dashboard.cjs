// Generate dashboard only from names already observed in real scrapes.
const fs=require('node:fs');const root=__dirname;const specs=[
 ['Scrapes / disponibilidade do coletor (não SLA da aplicação)','up','short'],
 ['Leitura committed disponível','tcc_collector_read_success','short'],
 ['Jobs duráveis por estado','tcc_jobs','short'],
 ['Progresso committed: registros visitados retidos','tcc_committed_visited','short'],
 ['Linhas alteradas / inseridas / excluídas','{__name__=~"tcc_committed_(changed|inserted|deleted)"}','short'],
 ['Commits retidos (gauge; não usar rate)','tcc_committed_commits','short'],
 ['Erros duráveis (não tentativas)','tcc_committed_errors','short'],
 ['Timing ativo persistido acumulado / operação','tcc_active_seconds','s'],
 ['Pausa persistida acumulada / operação','tcc_paused_seconds','s'],
 ['Timing com intervalo desconhecido','tcc_timing_uncertain_jobs','short'],
 ['CPU containers: cores usados, Linux VM','rate(container_cpu_usage_seconds_total{name!=""}[1m])','short'],
 ['Memória working set containers, Linux VM','container_memory_working_set_bytes{name!=""}','bytes'],
 ['I/O containers: setores escritos/s (não bytes)','rate(container_fs_sector_writes_total{name!=""}[1m])','short'],
 ['PostgreSQL conexão exporter','pg_up','short'],
 ['Sessões PostgreSQL / banco','pg_stat_database_numbackends','short'],
 ['Sessões esperando lock (ausência de série = sem dados)','sum by (datname) (pg_stat_activity_count{wait_event_type="Lock"})','short'],
 ['Locks PostgreSQL por modo (não duração de espera)','pg_locks_count','short'],
 ['Deadlocks PostgreSQL/s','rate(pg_stat_database_deadlocks[1m])','ops'],
 ['Transações PostgreSQL commit/s','rate(pg_stat_database_xact_commit[1m])','ops'],
 ['Tuplas mortas estimadas (não contagem exata)','pg_stat_user_tables_n_dead_tup','short'],
 ['Autovacuum/s','rate(pg_stat_user_tables_autovacuum_count[1m])','ops'],
 ['CPU do collector Node (não CLI de trabalho)','tcc_collector_process_cpu_seconds','s'],
 ['Lotes instrumentados retidos (cobertura, não todo histórico)','tcc_batch_retained_samples','short'],
 ['Trabalho committed acumulado antes checkpoint/commit','tcc_batch_retained_work_seconds','s'],
 ['Média trabalho committed (não p95 nem SQL puro)','sum(tcc_batch_retained_work_seconds) / sum(tcc_batch_retained_samples)','s'],
 ['Admissões / falhas / não resolvidas retidas','{__name__=~"tcc_batch_retained_(attempts|failures|unresolved)"}','short'],
 ['CPU CLI nos intervalos committed (não PostgreSQL)','tcc_batch_retained_cpu_seconds','s'],
 ['Maior amostra RSS CLI nas fronteiras (não pico exato)','tcc_batch_retained_rss_sample_max_bytes','bytes'],
 ['RSS do collector Node (não CLI de trabalho)','tcc_collector_process_resident_memory_bytes','bytes']
];
const panels=specs.map(([title,expr,unit],i)=>({id:i+1,title,type:'timeseries',datasource:{type:'prometheus',uid:'tcc-prometheus'},gridPos:{x:(i%2)*12,y:Math.floor(i/2)*8,w:12,h:8},targets:[{refId:'A',expr,legendFormat:'{{__name__}} {{operation}} {{mode}} {{status}} {{name}} {{datname}}'}],fieldConfig:{defaults:{unit,noValue:'Sem dados'},overrides:[]},options:{legend:{displayMode:'list',placement:'bottom'},tooltip:{mode:'multi'}}}));
panels.push({id:100,title:'Limites / gates ainda abertos',type:'text',gridPos:{x:0,y:Math.ceil(panels.length/2)*8,w:24,h:7},options:{mode:'markdown',content:'Instrumentação D v1 exercitada em fixture: diário committed atômico e somas duráveis; duração monotônica de trabalho inclui fronteiras/locks/DML e exclui checkpoint/COMMIT. Confirmação completa é log auxiliar best effort. Histórico antigo de backup não possui amostras: SEM DADOS, nunca backfill/zero inventado. CPU CLI é processo inteiro nos intervalos committed; RSS máximo de amostras de fronteira, não pico exato. Admissões não resolvidas não são falhas/retries. Falhas de conexão podem impedir registro final. p95/p99 da carga e disponibilidade continuam Fase E. cAdvisor mede VM Linux, não Windows. Gauges retidos não usam rate; exclusão do histórico reduz valores. Sem percentual cursor/H.'}});
const dashboard={uid:'tcc-phase-d',title:'TCC — Fase D: committed + PostgreSQL + Linux VM',schemaVersion:39,version:1,refresh:'5s',timezone:'browser',time:{from:'now-15m',to:'now'},tags:['TCC','Fase-D-parcial'],panels};
fs.mkdirSync(root+'/grafana/dashboards',{recursive:true});fs.writeFileSync(root+'/grafana/dashboards/tcc.json',JSON.stringify(dashboard,null,2)+'\n');console.log('dashboard panels',panels.length);
