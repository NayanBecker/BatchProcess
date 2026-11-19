'use strict';
// Current snapshot only: never export live SQL as a Prometheus label.
const rawSql = `WITH selected AS MATERIALIZED (
 SELECT pid, application_name, state, query, query_start, xact_start,
        wait_event_type, wait_event
 FROM pg_catalog.pg_stat_activity
 WHERE datname = current_database()
   AND pid <> pg_backend_pid()
   AND application_name <> 'tcc_observability_readonly'
   AND application_name NOT ILIKE 'grafana%'
   AND state IN ('active', 'idle in transaction', 'idle in transaction (aborted)')
 ORDER BY query_start DESC NULLS LAST, pid
 LIMIT 10
)
SELECT s.query_start AS "Início da consulta", s.pid AS "PID", s.application_name AS "Aplicação",
 CASE WHEN s.wait_event_type = 'Lock' THEN 'Aguardando lock'
      WHEN s.state = 'active' THEN 'Ativa'
      WHEN s.state = 'idle in transaction (aborted)' THEN 'Transação ociosa (abortada)'
      ELSE 'Transação ociosa' END AS "Estado",
 CASE WHEN s.state = 'active' THEN
      extract(epoch FROM statement_timestamp() - s.query_start)::double precision END AS "Execução consulta (s)",
 extract(epoch FROM statement_timestamp() - s.xact_start)::double precision AS "Transação aberta (s)",
 CASE WHEN s.wait_event_type = 'Lock' THEN
      extract(epoch FROM statement_timestamp() - locks.wait_start)::double precision END AS "Espera lock (s)",
 s.wait_event_type AS "Tipo espera", s.wait_event AS "Evento espera",
 cardinality(blockers.pids) AS "Quantidade bloqueadores",
 array_to_string(blockers.pids, ', ') AS "PIDs bloqueadores",
 left(s.query, 500) AS "SQL atual / última na transação (500 caracteres)"
FROM selected s
CROSS JOIN LATERAL (SELECT pg_catalog.pg_blocking_pids(s.pid) AS pids) blockers
LEFT JOIN LATERAL (
 SELECT min(l.waitstart) AS wait_start FROM pg_catalog.pg_locks l
 WHERE l.pid = s.pid AND NOT l.granted
) locks ON true
ORDER BY s.query_start DESC NULLS LAST, s.pid`;
module.exports={
 id:11,title:'Top 10 consultas — mais recentes primeiro',type:'table',
 datasource:{type:'grafana-postgresql-datasource',uid:'batcheman-postgres'},
 maxDataPoints:10,gridPos:{x:0,y:26,w:24,h:10},
 description:'Snapshot atual a cada 30s; consultas curtas podem não aparecer. Até 10 sessões do banco conectado por início da consulta, mais recentes primeiro; não é histórico de consultas concluídas. Idle normal e monitoramento ficam ocultos. Execução somente para active; transação aberta é idade separada. Espera lock usa pg_locks.waitstart (nulo se indisponível), nunca a idade da consulta; IO não é lock. Locks concedidos não significam bloqueio. Tabela vazia sem erro = nenhuma sessão elegível. SQL truncado, NÃO anonimizado: pode conter dados sensíveis; acesso apenas a usuários locais autorizados. SQL não vai ao Prometheus. A conta existente do datasource não tem privilégios read-only impostos pelo painel.',
 targets:[{refId:'A',format:'table',editorMode:'code',rawQuery:true,rawSql}],
 fieldConfig:{defaults:{noValue:'—',custom:{align:'auto',cellOptions:{type:'auto'},filterable:true}},overrides:[
  {matcher:{id:'byName',options:'Início da consulta'},properties:[{id:'unit',value:'dateTimeAsIso'},{id:'custom.width',value:220}]},
  ...['Execução consulta (s)','Transação aberta (s)','Espera lock (s)'].map(name=>({matcher:{id:'byName',options:name},properties:[{id:'unit',value:'s'},{id:'decimals',value:1}]})),
  {matcher:{id:'byName',options:'SQL atual / última na transação (500 caracteres)'},properties:[{id:'custom.width',value:600},{id:'custom.wrapText',value:true}]},
  {matcher:{id:'byName',options:'Estado'},properties:[{id:'custom.width',value:210},{id:'custom.cellOptions',value:{type:'color-text'}},{id:'mappings',value:[{type:'value',options:{'Aguardando lock':{text:'Aguardando lock',color:'red'},'Transação ociosa':{text:'Transação ociosa',color:'orange'},'Transação ociosa (abortada)':{text:'Transação ociosa (abortada)',color:'orange'},'Ativa':{text:'Ativa',color:'green'}}}]}]}
 ]},options:{showHeader:true,cellHeight:'md',footer:{show:false},sortBy:[{displayName:'Início da consulta',desc:true}]}
};
