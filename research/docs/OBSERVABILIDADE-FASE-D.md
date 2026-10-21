> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Observabilidade — Fase D v1 concluída no escopo funcional

## Entrega D v1 — estado atual (prevalece sobre o snapshot histórico abaixo)

Implementada integração no executor ativo; sem validate/restore, novas dependências ou migrations. Somente fixtures pequenas guardadas em `tcc_framework_test` receberam DDL/DML; `backup_testes` e `postgres` permaneceram somente leitura de monitoramento. Nenhum benchmark/carga ou Fase E/F executado.

Para execução gerenciada usar `node observability/start-collector.cjs` (um único processo dono do listener, loader nativo sem imprimir credenciais). O wrapper antigo spawnSync pode deixar filho vivo quando somente o wrapper é encerrado no Windows; foi necessário identificar e parar exclusivamente o antigo PID 18528 do collector, sem tocar banco/infra. Substituto gerenciado: `proc_2397c1922506`. Não há mudanças de senha Grafana.

### Contrato durável e fronteiras

- `transactional_state.observability.version=1`: admissões, falhas registradas, amostras committed, contagens instrumentadas visited/changed/inserted/deleted, soma de workSeconds/cpuSeconds e maior amostra RSS. Criado apenas a partir da instrumentação: **histórico antigo não é reconstruído artificialmente**.
- Uma admissão é persistida antes da transação de trabalho, sob posse e lock. É uma tentativa admitida, não prova de que DML começou. Crash ou controle pause/cancel entre admissão e execução pode deixar `unresolved=attempts-samples-failures`; não chamar isso de falha/retry. Não há retry automático. Tentativas anteriores à versão 1 são desconhecidas.
- `batch_committed_v1` em `batch_job_logs.metadata` é inserido na **mesma transação** de DML/checkpoint. Se evento ou checkpoint falha, tudo reverte. Inclui sequência e tentativa por job, deltas e medições; IDs ficam no diário, nunca labels. A tabela de logs existente passa a ser necessária para execução instrumentada; fixtures antigas foram ajustadas para aplicar a migration 003 já existente. Não foi aplicada migration em banco protegido.
- `workSeconds`: relógio monotônico `process.hrtime.bigint`, entrada do callback da transação até retorno do DML (inclui guard, row lock, configuração SQL e seleção de fronteira). **Exclui escrita do diário/checkpoint e COMMIT**, BEGIN/aquisição; não é SQL puro, nem tempo de ciclo experimental do protocolo. Somas persistidas usam exatamente as amostras do diário. Nenhum histograma/percentil foi inventado.
- `batch_confirmed_v1`: duração monotônica antes da chamada da transação até seu retorno/ack, inclui BEGIN/checkpoint/COMMIT. Capturada antes de audit/listeners; persistência auxiliar **best effort pós-commit**, pode faltar se processo/conexão cair, não deve determinar replay nem contagem committed. Não é possível gravar no próprio commit a duração exata observada após esse commit. Não é exportada como se tivesse cobertura completa.
- Falha real de execução registra `failures` junto ao estado failed quando a conexão de posse ainda permite escrita. Sem conexão, admissão persiste e resultado pode continuar não resolvido. Confirmação perdida com checkpoint já visível não soma falha de tentativa committed (`lastCommittedAttempt`). Listener síncrono/assíncrono não altera commit.
- `cpuSeconds`: delta `process.cpuUsage` do **processo Node de trabalho** no mesmo intervalo pré-checkpoint, inclui outras atividades desse processo; não mede CPU SQL/servidor nem CLI inteira. CPU de intervalos abortados e custos fora desse intervalo não estão nos totais committed. Granularidade do SO pode produzir zero em intervalos curtos.
- `rssSampleMaxBytes`: máximo de apenas duas amostras `process.memoryUsage().rss` por intervalo, entrada e fim do trabalho; não pico exato. Em execução via ts-node inclui runtime/compilação residente. Não é memória PostgreSQL. cAdvisor continua restrito à VM Linux, não Windows.
- Logs não incluem conteúdo fonte, SQL com dados nem mensagem/stack arbitrária de erro. Metadados de job/seq não são rótulos. Retenção/cleanup pode apagar diário; agregados no estado sobrevivem enquanto job existir. Preservar ambos em campanha.

### Exportação e PromQL

Todos `tcc_batch_retained_*{operation,mode}` são **gauges do histórico retido instrumentado**, reconstruídos do JSONB a cada leitura read-only. Restart/scrape não incrementam nada. Não usar `rate/increase`. Labels aceitam apenas EXP-06/08/09 e A/B; sem dataset/jobId. Jobs sem versão 1 não recebem amostras zero.

| Sufixo | Significado / consulta |
|---|---|
| jobs / samples | cobertura de jobs / lotes committed instrumentados |
| attempts / failures / unresolved | admissões / falhas registradas / resultados desconhecidos; não retries inferidos |
| visited / changed / inserted / deleted | somas dos deltas instrumentados, sem misturar histórico sem amostra |
| work_seconds | soma durações pré-checkpoint; `sum(tcc_batch_retained_work_seconds) / sum(tcc_batch_retained_samples)` é média retida, não p95 |
| cpu_seconds | soma CPU processo nos intervalos committed descritos acima |
| rss_sample_max_bytes | maior amostra de fronteira dos jobs retidos do grupo; não somar máximos para alegar pico |

`metrics-catalog.json` separa `app` (scrape real 9464 do backup histórico) e `app_fixture` (HTTP real da fixture sintética de cinco linhas), com HELP/TYPE reais e PromQL explicada. As séries novas foram observadas somente na fixture; não se pode escrevê-las retroativamente em backup protegido. Dashboard provisionado e lido pela API: **30 painéis / 29 consultas**, 7 sem séries: espera Lock mais os seis painéis novos, porque nenhum job instrumentado foi executado no backup. Ausência preservada, sem fill-zero. Prometheus **4/4 up**, 15 jobs/260 visited/31 commits históricos reconciliados; isso não certifica performance.

### Verificações e artefatos

Build e db:check passaram antes dos ensaios. Regressão após adequar fixtures à tabela de diário: **43 unitários e 57 testes de integração** verdes; collector **3/3**, fixture observability **1/1**. Novo `tests/integration/batch-observability.test.cjs`: cinco linhas, A com 1 commit, B com 3, mais falha SQL real division-by-zero após DML revertida. Diário e soma/count/deltas reconciliados; listeners com erro isolados. HTTP real exporta A samples=1/attempts=1 e B samples=3/attempts=4/failures=1. Reload do estado não reconta; teste reader existente exercita pool novo e rollback sem alteração de committed.

Artefatos locais sanitizados (ignorados Git): `phase-d-events.json` (eventos individuais e resumos), `phase-d-fixture.prom` (scrape HTTP), demais exports originais atualizados. Não são benchmark. O collector anterior `proc_0ad8bd06c7ca` foi encerrado para carregar código novo; primeira tentativa de background sem PTY saiu com `stdin is not a tty`; processo substituto com PTY informado no relatório final. Somente Grafana foi reiniciado para carregar bind do dashboard; nenhuma infra de banco foi reiniciada. Export-verify confirmou painel/datasource por read-back e consultas válidas.

**Aceite do agente principal:** Fase D v1 concluída como instrumentação funcional, após regressão reexecutada (43 unitários/57 integrações), export-verify e revisão independente sem bloqueadores. Revisor executou 3 testes do collector e consultas HTTP read-only; não repetiu a integração do núcleo. Duração full-commit tem garantia auxiliar limitada, attempts de crash podem ficar irresolvidos e CPU/RSS não cobrem execução inteira/falhas. Não declarar p95/p99, disponibilidade de carga, throughput de benchmark ou encerramento E/F: protocolo deixa perfis/taxas/repetições para piloto autorizado. Não fazer backfill nem tratar lacunas como zero.

Melhorias futuras não bloqueadoras apontadas na revisão: ampliar injeção de falhas para diário/checkpoint e listener assíncrono no teste D; incluir agregados v1 sanitizados na exportação por job e sua reconciliação por grupo. O exportador atual concilia os totais históricos; não alegar que já concilia todos os campos v1 de campanhas futuras.

---

## Snapshot histórico anterior à integração do núcleo (não descreve o estado atual)


**Não declarar a Fase D concluída.** Stack, catálogo real, reconciliação e exportação funcionam; duração individual de lote, tentativas e recursos das CLIs de trabalho ainda precisam de instrumentação própria. Não houve benchmark, carga concorrente, restauração nem validação de dados de domínio.

## Operação local (Windows + bash)

Na raiz `M:/ProjetoTcc/Processamento_em_loteV5`:

```bash
node observability/run.cjs up
# Manter em outro terminal; endpoint durável além da vida de cada CLI:
node observability/start-collector.cjs
# Com ambos disponíveis:
node observability/export-verify.cjs
node --test observability/collector.test.cjs
npm run db:check
node -r ts-node/register --test observability/fixture.test.cjs
```

O wrapper carrega somente o loader nativo existente `dist/db/config` (não abre pool global), injeta a senha no ambiente do subprocesso e não a imprime. Requer build existente. Não modifica `.env`, scripts npm ou configuração global. A configuração explícita `observability/collector.config.json` define host, banco, schema e **nome** da variável `TCC_MONITOR_PASSWORD`; o wrapper usa essa variável, ou injeta a senha já carregada `DB_PASSWORD`. O collector isolado não escolhe senha de outro nome por conta própria. A conexão é `backup_testes/benchmark_control`, somente leitura, pool máximo 1, timeout 3s, snapshot REPEATABLE READ READ ONLY por scrape. Não consulta tabelas de origem ou snapshots de dados.

- Grafana: **http://127.0.0.1:3000/d/tcc-phase-d**, usuário `admin`.
- Senha aleatória gerada uma vez em `observability/local/grafana-password`, ignorada pelo Git; abrir esse arquivo localmente para o login. Não colar senha no chat. Não executar `docker compose config`/`docker inspect` com ambiente exposto em evidências.
- Prometheus: **http://127.0.0.1:9090**, `/targets` e `/api/v1/targets`.
- Collector: **http://127.0.0.1:9464/metrics**, `/health` (503 se DB indisponível).
- PostgreSQL exporter: **http://127.0.0.1:9187/metrics**.
- cAdvisor: **http://127.0.0.1:9080/metrics**.
- `node observability/run.cjs ps`; `node observability/run.cjs down` encerra **somente** a stack de monitoring, conservando volumes. Encerrar collector com Ctrl+C no seu terminal. Não usar `down -v` para preservar séries.

Grafana tem autenticação habilitada, acesso anônimo e signup desabilitados. Publicações são loopback; Prometheus/exporters não têm autenticação própria: qualquer processo local pode ler métricas. O acesso Docker Desktop a `host.docker.internal:9464` com collector ligado em 127.0.0.1 foi efetivamente exercitado neste host. Não ampliar bind automaticamente se outro ambiente não oferecer esse encaminhamento.

## Serviços e segurança

Projeto Compose separado `tcc-observability`; nenhum PostgreSQL novo, restart, DDL, role ou alteração de rede no `dbpostgres`. Exporter conecta via `host.docker.internal:5432`; servidor observado PostgreSQL **17.4**, imagem preexistente `postgres`, mantida como estava. `hermes-api:8000` permanece fora desta stack.

Imagens obtidas de releases oficiais e confirmadas por pull real, fixadas por versão **e digest** em `compose.yaml`:

| Serviço | Versão | Fonte |
|---|---|---|
| Prometheus | v3.15.0 | https://github.com/prometheus/prometheus/releases/tag/v3.15.0 |
| Grafana | 13.2.4 | https://github.com/grafana/grafana/releases/tag/v13.2.4 |
| postgres_exporter | v0.20.1 | https://github.com/prometheus-community/postgres_exporter/releases/tag/v0.20.1 |
| cAdvisor | 0.60.6 | https://github.com/google/cadvisor/releases/tag/v0.60.6 |

Credenciais via ambiente runtime; administradores Docker ainda conseguem lê-las. O arquivo local herda ACLs Windows: `mode:0600` não é certificação de isolamento ACL Windows. Não compartilhar esse diretório. O exporter reutiliza usuário existente `postgres`, sem criar role; `PGOPTIONS` impõe read-only e timeout. Isso **não** equivale a privilégio mínimo por GRANT: role restrita futura exige autorização separada.

cAdvisor funciona **sem privileged**, mas recebe mounts de `/`, `/sys`, `/var/lib/docker` e `/var/run` da **VM Linux** em read-only. `/var/run` inclui socket Docker: mount read-only **não** impede comandos de escrita via API do socket. Tratar esse coletor como confiável com acesso sensível ao daemon; não publicar na rede, não adicionar privileged para contornar falhas. Não coleta CPU/memória/I/O do host Windows ou de processos Node Windows. Identificadores de containers são séries de infraestrutura, não labels da aplicação; churn ainda cria séries, limitado por retenção.

## Catálogo real e interpretação

`observability/metrics-catalog.json` foi gerado de scrapes reais **antes** das consultas finais: 15 nomes app/collector, 392 exporter PostgreSQL, 134 cAdvisor, incluindo métricas internas Go/processo. `export-verify.cjs` o regenera; nomes e HELP/TYPE estão separados por domínio. PromQL do dashboard foi executada na API, não inferida de dashboards genéricos.

### Aplicação / histórico committed

- `tcc_jobs{operation,mode,status}`: quantidade **atual retida** por estado, incluindo completed/failed; não eventos de transição.
- `tcc_committed_visited/changed/inserted/deleted/commits/errors{operation,mode}`: somas do estado persistido visível, reconstruídas a cada scrape. **Gauges**, não counters `_total`; não usar `rate()` para alegar throughput. Mesmo scrape repetido/restart não incrementa nada. Remoção de histórico pode diminuir valores. Errors usa `error_count`, sujeito ao registro best-effort do framework, não conta tentativas.
- `tcc_active_seconds`, `tcc_paused_seconds`: somas de timing **persistido**, ms convertidos para segundos; sem extrapolar intervalos ainda não checkpointados. `tcc_timing_jobs` e `tcc_timing_uncertain_jobs` expõem cobertura/incerteza. Não é duração individual de lote, percentil ou latência por registro. Retomadas/recovery precisam respeitar incerteza do núcleo.
- `tcc_collector_read_success`: disponibilidade da leitura; erro DB remove amostras committed em vez de servir zeros/stale. `tcc_collector_read_seconds`, `tcc_collector_process_cpu_seconds`, `tcc_collector_process_resident_memory_bytes` são do **collector**, não do trabalho batch. CPU acumulada do processo reinicia com processo; tipo implícito untyped, não interpretar como CPU instantânea.

Labels da aplicação aceitam somente EXP-06/08/09, A/B e estados fixos pending/running/paused/completed/failed/cancelled. Outros jobs não entram neste catálogo experimental. Nenhum job ID/dataset/tabela arbitrária vira label. Contagens brutas preservam strings BIGINT; o backend Prometheus representa floats, portanto contagens acima da precisão exata de float exigem conferir JSON/DB.

Não existe denominador elegível persistido garantido por todas operações; **cursor/H não é percentual** com IDs lacunares. Progresso mostrado em registros committed, não porcentagem fabricada. Logs duráveis atuais contêm running/checkpoint/completed; são auxiliares best-effort e não um diário completo de tempos por lote. O collector usa o estado transacional como autoridade e não conta logs para inventar commits.

### PostgreSQL e containers

Dashboard usa séries realmente observadas: sessões `pg_stat_database_numbackends`, `pg_stat_activity_count` (inclui dimensões wait_event_type), locks por modo `pg_locks_count`, deadlocks e commits/s de `pg_stat_database_deadlocks/xact_commit`, tuplas mortas **estimadas** e autovacuum de `pg_stat_user_tables_*`. O exporter consulta estatísticas do cluster e algumas métricas incluem outros bancos; isso não significa DML neles. O filtro de bancos não é uma barreira de autorização nem remove todas as séries cluster-wide.

Sessões esperando `wait_event_type="Lock"` não tiveram série nesta observação: painel mostra **sem dados**, não zero e não duração de espera. Tuplas mortas são estimativas. I/O de PostgreSQL em `blk_read_time/blk_write_time` é milissegundos acumulados e depende de `track_io_timing`; nomes aparecem no catálogo, mas zero não prova I/O sem custo. O painel cAdvisor usa **setores/s**, não presume bytes por setor. CPU `rate(container_cpu_usage_seconds_total[1m])` tem unidade cores; working set em bytes. Tudo pertence à VM/container Linux, não máquina física/Windows.

Counters de infraestrutura podem resetar em restart/`pg_stat_reset`; usar `rate` com janelas suficientes, conferir `resets()`/`pg_stat_database_stats_reset` e manter manifesto de reinícios. Não foi provocado reset de estatísticas do banco. Não aplicar `rate` aos gauges committed. Falta de série não é zero: dashboard não usa `or vector(0)` nem fill-zero.

## Evidência exercitada

- `db:check`: destino confirmado **tcc_framework_test**.
- Unitários collector: **2/2**, HTTP real, scrape repetido idempotente, labels limitadas, conversão de unidade e indisponibilidade sem credencial em resposta.
- Integração isolada: **1/1**; fixture sintética de **7 linhas**, batch size 3, **3 commits**, status completed; HTTP conciliado com os dados/control reais. Transação propositalmente abortada não altera contagem; novo pool relê exatamente o mesmo histórico. Cleanup final: **zero** schemas `phase_c_test_%`. Falha inicial no nome de migration do harness foi corrigida antes do GREEN.
- Read-only em backup_testes: **15 jobs completed, 260 registros visitados/processados e 31 commits**; somas Prometheus conciliadas programaticamente com DB. Algumas execuções históricas são pequenas e não necessariamente 20 linhas; não são medidas de desempenho.
- Prometheus: **4/4 targets up**; `pg_up=1`, `pg_exporter_last_scrape_error=0`, coletores PostgreSQL com sucesso na observação.
- Grafana: datasource `tcc-prometheus` lido de volta pela API, URL interna conferida; dashboard servido idêntico ao JSON provisionado: **24 painéis**, 23 consultas válidas; somente painel de espera Lock sem série. 1 painel textual delimita medições ausentes. Atualização do bind mount não apareceu imediatamente no provisionamento; restart **somente Grafana** foi necessário e read-back final confirmou a nova versão.
- Exportações reais em `observability/local/`: `targets.json`, `app/postgres/containers.prom`, `dashboard-query-results.json`, `prometheus-range.json`, `prometheus-range.csv`, `committed-jobs.json`, `verification.json`. CSV contém timestamp Unix, labels e valor; janela de 5min/step 5s, quantidade cresce conforme coleta. JSON por job contém somente metadados operacionais/contagens/timing selecionados, não configuração, senha ou dados de domínio. Copiar evidências para diretório de campanha controlado antes de nova exportação (arquivos locais são sobrescritos).

## Resolução, custo e gates restantes

Scrape e refresh 5s, timeout scrape 4s; pool/SQL timeout 3s; cAdvisor housekeeping 5s. Isso preserva totais acumulados após CLI terminar, **não recupera o início/fim de lotes rápidos**. Snapshots não permitem reconstruir distribuição individual nem transações que começaram e abortaram entre scrapes.

Limites Compose: Prometheus 384MiB/0.5 CPU, Grafana 384MiB/0.5, exporter 96MiB/0.25, cAdvisor 192MiB/0.5. Prometheus retém 7 dias ou limite 1GB de blocos (WAL/head acrescentam disco). Docker stats pontual observado: Prometheus 58.58MiB, Grafana 76.3MiB, exporter 10.04MiB, cAdvisor 25.39MiB; CPU Grafana 51.41% naquele instante de inicialização. Não é avaliação estabilizada nem overhead experimental. Leituras geram sessões/transações e afetam cache/estatísticas; medir overhead com e sem stack no piloto, não subtrair custos arbitrariamente.

**Para fechar D:** acordar integração compartilhada após alterações concorrentes do núcleo, com diário por lote/attempt, timestamps monotônicos de início e confirmação, contadores de resultado e identidade de execução fora das labels; gravar estado/evento atomicamente quando possível e distinguir confirmação, falha e observação perdida. Medir CPU/RSS da CLI de trabalho por mecanismo dedicado (não reutilizar processo do collector). Exercitar lote rápido/falha real e conciliar evento por evento. Não inferir duração pelo intervalo entre eventos pós-audit ou por delta de timing ativo que inclui outras etapas. Não precisa/reintroduz comandos de validate de dados ou restore.

p95/p99/erros/timeouts da carga concorrente, disponibilidade percebida e testes de desempenho permanecem **Fase E**, sem série/painel artificial. Nenhuma campanha massiva ou operação em fonte foi executada. Nenhum arquivo `src`, `.env`, package ou documentação canônica compartilhada foi alterado por esta entrega.
