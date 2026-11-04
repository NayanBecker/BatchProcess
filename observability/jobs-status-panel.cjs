'use strict';
// One result frame avoids a dataset selector for each metric/job combination.
const counts=[['visited','Visitados'],['changed','Alterados'],['commits','Commits']].map(([key,label])=>
 `CASE WHEN (transactional_state->>'${key}') ~ '^[0-9]+$' THEN (transactional_state->>'${key}')::numeric END AS "${label}"`
).join(',\n ');
const rawSql=`SELECT id AS "ID", job_name AS "Job", status AS "Estado",
 transactional_state->>'mode' AS "Modo",
 ${counts},
 error_count AS "Erros"
FROM "batcheman_control"."batch_jobs"
ORDER BY id DESC
LIMIT 200`;
const states={pending:{text:'Pendente',color:'blue'},running:{text:'Em execução',color:'yellow'},paused:{text:'Pausado',color:'orange'},completed:{text:'Concluído',color:'green'},failed:{text:'Falhou',color:'red'},cancelled:{text:'Cancelado',color:'gray'}};
module.exports={
 id:8,title:'Jobs — estado e progresso confirmado',type:'table',
 datasource:{type:'grafana-postgresql-datasource',uid:'batcheman-postgres'},
 maxDataPoints:200,gridPos:{x:0,y:11,w:24,h:8},
 description:'Uma linha por execução, com os 200 IDs mais recentes em ordem numérica decrescente. Todos os campos na mesma tabela, sem seletor de métricas. Contagens confirmadas no último commit; — indica informação indisponível, não zero. Estado running é persistido, não prova heartbeat. Não depende do período selecionado nos gráficos. Leitura direta do controle existente, sem alterar jobs.',
 targets:[{refId:'A',format:'table',editorMode:'code',rawQuery:true,rawSql}],
 fieldConfig:{defaults:{noValue:'—',custom:{align:'auto',cellOptions:{type:'auto'},filterable:true}},overrides:[
  {matcher:{id:'byName',options:'ID'},properties:[{id:'custom.width',value:65},{id:'decimals',value:0}]},
  {matcher:{id:'byName',options:'Job'},properties:[{id:'custom.width',value:260}]},
  {matcher:{id:'byName',options:'Estado'},properties:[{id:'custom.width',value:135},{id:'custom.cellOptions',value:{type:'color-text'}},{id:'mappings',value:[{type:'value',options:states}]}]},
  {matcher:{id:'byName',options:'Modo'},properties:[{id:'custom.width',value:115},{id:'mappings',value:[{type:'value',options:{A:{text:'Monolítico'},B:{text:'Lotes'}}}]}]},
  ...['Visitados','Alterados','Commits','Erros'].map(name=>({matcher:{id:'byName',options:name},properties:[{id:'unit',value:'locale'},{id:'decimals',value:0},{id:'custom.width',value:135},{id:'custom.align',value:'right'}]}))
 ]},
 options:{showHeader:true,cellHeight:'sm',enablePagination:false,footer:{show:false},sortBy:[{displayName:'ID',desc:true}]}
};
