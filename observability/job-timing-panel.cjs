'use strict';
// Existing durable job history only; never infer timestamps from scrape time.
const rawSql=`WITH selected AS MATERIALIZED (
 SELECT id, job_name, status, started_at, completed_at
 FROM "batcheman_control"."batch_jobs"
 WHERE started_at IS NOT NULL
   AND (completed_at IS NOT NULL OR status = 'running')
 ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, id DESC
 LIMIT 20
), runs AS (
 SELECT *, CASE WHEN completed_at IS NOT NULL THEN completed_at
                WHEN status = 'running' THEN statement_timestamp() END AS finished_at
 FROM selected
)
SELECT points.time AS "time", points.elapsed AS "Tempo decorrido",
 'Job #' || j.id || ' — ' || j.job_name || ' (' || j.status || ')' AS metric
FROM runs j
CROSS JOIN LATERAL (VALUES
 (j.started_at, 0.0::double precision),
 (j.finished_at, extract(epoch FROM j.finished_at - j.started_at)::double precision)
) points(time, elapsed)
WHERE j.finished_at >= j.started_at
ORDER BY points.time, metric`;
module.exports={
 id:10,title:'Execução dos jobs — início e fim',type:'timeseries',
 datasource:{type:'grafana-postgresql-datasource',uid:'batcheman-postgres'},
 gridPos:{x:12,y:19,w:12,h:7},maxDataPoints:600,timeFrom:'7d',
 description:'Uma linha por ID do job, nos últimos 7 dias de visualização. Eixo horizontal: data/hora; eixo vertical: tempo decorrido desde o início. O ponto inicial vale zero em started_at; o ponto final usa completed_at e a duração entre as datas. A legenda mostra a duração, e o tooltip informa o horário do ponto. Entre os dois extremos a linha representa tempo decorrido, não amostras de CPU ou progresso. Inclui pausas e throttle. Jobs running vão até a consulta atual, sem inventar finalização; pendentes não têm linha. Até 20 execuções, em execução primeiro e depois IDs recentes. Fuso do dashboard; estados antigos abandonados podem ter intervalo longo, que não prova SQL ativo durante todo esse tempo.',
 targets:[{refId:'A',format:'time_series',editorMode:'code',rawQuery:true,rawSql}],
 fieldConfig:{defaults:{unit:'s',decimals:1,min:0,color:{mode:'palette-classic'},custom:{drawStyle:'line',lineInterpolation:'linear',lineWidth:2,fillOpacity:0,showPoints:'always',pointSize:6,spanNulls:true,axisLabel:'Tempo decorrido desde o início',hideFrom:{legend:false,tooltip:false,viz:false}}},overrides:[]},
 options:{legend:{showLegend:true,displayMode:'table',placement:'bottom',calcs:['lastNotNull']},tooltip:{mode:'single',sort:'none'}}
};
