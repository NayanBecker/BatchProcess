# TCC II — Estado atual

## Fase C concluída — escopo DML transacional ativo

- Núcleo transacional A/B, checkpoint/DML atômicos, BIGINT/H, posse de sessão, pausa/cancelamento cooperativos, requeue/dispatch/recovery explícitos e shutdown próprio verificados em fixtures pequenas.
- EXP-06 UPDATE, EXP-08 INSERT SELECT/cópia e EXP-09 DELETE disponíveis. SQL A/B compartilhado; marcação SC do DELETE é preparação separada. Outras operações do catálogo metodológico não são jobs disponíveis.
- Por autorização posterior do usuário, caminho item/processItem, retry/Promise.race e CLI legados foram arquivados fora de aplicação/build/testes/validações. Manager, registry e modelos compartilhados permanecem; consolidação de config/contexto e timing foi exercitada no escopo ativo.
- Review manual exige **clone LOCAL do usuário**, configuração separada em config/clone.example.json. postgres/tcc_framework_test proibidos no modo manual; backup_testes exige opt-in estrito e schemas privados fixos. Evidência de execução anterior no backup é histórica; esta retirada não operou nele nem redirecionou a conexão global.
- Manual oferece check-config/check/prepare/mark/run A/B/list/status/logs/errors/pause/cancel/resume/recover/dispatch, target/allowlist/confirmação exatos e token dry-run. Review pequeno/controlado, até 1000 linhas por tabela.
- **Retirados validate de resultados/dados e restore**, incluindo branches/flags/interfaces/implementação da aplicação e build. Wrapper recusa ambos antes de carregar conexão. Trechos/roteiros superados em archive/result-tools; nenhum substituto externo executável. Helpers sintéticos movidos para tests/helpers/fixture-artifact.ts; snapshots de preparo, histórico e checkpoints preservados.
- **Não retirados:** status/completed/failed, error_count, logs/errors, falhas SQL/checkpoint, validateInitial/preconditions, guards de parâmetros/destino, rollback e recovery. completed é conclusão operacional, não integridade de dados certificada. Asserções/SQL independentes de resultados permanecem nas suítes; A/B usam fixtures novas, sem reset de aplicação.

## Evidência atual

**Fase D v1 concluída no escopo de observabilidade funcional:** Prometheus com 4 alvos ativos; Grafana em http://127.0.0.1:3000/d/tcc-phase-d, 30 painéis/29 consultas. Métricas reais PostgreSQL/container/estado e diário por lote instrumentado; regressão atual 43 unitários/57 integrações aprovada pelo agente principal, revisão independente sem bloqueadores. Histórico antigo sem métricas v1 permanece sem série. Detalhes/limites: `docs/OBSERVABILIDADE-FASE-D.md`. O aceite D não incluía carga concorrente; piloto E atual descrito abaixo.

Retirada: RED observado na recusa CLI/API antes de configuração/import de banco; GREEN confirmado. Build exit 0; unitários **43/43**; integração **56/56** (incluindo parents/subtestes Node), zero failures/skips/cancelled/todo. db:check confirmou tcc_framework_test antes de integração; fixtures próprias com cleanup e leitura final do catálogo: **zero schemas phase_c_test_<32 hex>**. git diff --check exit 0 (avisos LF/CRLF somente). Contagens em docs/EVIDENCIAS-FASE-C-FINAL.md são históricas superadas. Worktree preservado sem commit/push/reset; sem benchmark ou mutação do backup/postgres.

Quatro achados finais corrigidos e exercitados: identificadores canônicos <=63 bytes sem aliases/truncamento; fencing de destino durável nos controles sob row lock; throttle <=2147483647 ms antes de pool/persistência; AbortSignal sticky do comando com checks antes de criação/dispatch/aquisição. RED/GREEN e problemas corrigidos do harness registrados no relatório. Evento Node SIGINT simulado, não sinal nativo Windows. Correções conferidas em nova revisão independente, sem bloqueadores remanescentes; aceite do agente principal registrado.

## Etapa E — piloto real concluído, escopo limitado

- Exclusão entre pilotos por guarda PostgreSQL; carga seeded open-loop, deadline/cancelamento SQL/drain e perfil write separado em load_counter. Preparação/integridade externas a src; reviewguards preservadas.
- 18 rodadas: controle/A/B, três repetições por perfil read/write; 1.000 linhas sintéticas, 100 req/s, janela 4 s. **7.200 oferecidas, 7.192 concluídas, zero erros/timeouts, oito descartes.** Integridade aprovada; zero schemas próprios no readback final.
- Desempenho preliminar: dispatch→retorno mediano A/B leitura 100,59/439,84 ms; escrita 73,67/446,38 ms. Não é cronômetro DML-only. Vazão perto de 100 resp/s; duas rodadas write A com sobreposição insuficiente. **Sem conclusão de superioridade.**
- Evidência: `experiments/results/phase-e-2026-10-19T14-43-33-286Z-27105d/manifest.json` (resultDirectory absoluto); 115 séries/11.040 amostras, 96 timestamps de scrape, nenhuma lacuna na grade; cinco consultas E com série, datasource/dashboard relidos pela API.
- Verificação atual: build/db:check aprovados; **50 unitários/62 integrações/4 observabilidade**, zero falhas/skips; diff-check exit 0. Collector 9464 HTTP 200, iniciado porque não havia listener; stack/banco preservados. Uma tentativa a 200/s falhou e foi preservada, sem misturar resultados.
- Procedimento e glossário: `docs/ETAPA-E.md`; tabelas/limitações: `docs/RESULTADOS-PILOTO-E.md`. E integral/F seguem pendentes: timing definitivo, matriz/repetições mais robustas, recursos/locks isolados e backup/restauração certificados. Nenhuma campanha massiva, .env/deps, commit/push ou escrita no backup/origem/postgres.

## Limites e próximas fases

- Fase C encerrada pelo agente principal no escopo ativo EXP-06/08/09, após regressão e revisão independente. Não certifica campanha massiva ou clone real.
- Resposta COMMIT perdida na rede não exercitada. Crash real, perda de backend e confirmação descartada simulada têm evidência; recovery relê estado com posse e não presume rollback/ exactly-once.
- Backup real e restauração de campanha não certificados. Não há restore de review no framework; snapshot de preparo/fixture não substitui backup. Nova execução exige conjunto inicial isolado preparado externamente pelo operador, sem apagar histórico para destravar.
- Instrumentação Prometheus/Grafana v1 entregue; piloto pequeno de carga concorrente executado na Etapa E acima; desempenho/escalabilidade definitivos e campanha ampla permanecem posteriores. Concurrency de review é um worker/contexto; não alegar escala arbitrária. cAdvisor observa a VM Linux, não o host Windows.
- Timing ativo/pausado/parede é operacional delimitado por checkpoints; recovery marca intervalo desconhecido. Logs/erros auxiliares são best-effort em perda de conexão.
- Na retirada C: nenhuma escrita em postgres, backup_testes ou origem; nenhum .env/deps/public migration/benchmark modificado ou executado. Evidências anteriores do backup continuam arquivadas como históricas.

## Referências

| Assunto | Fonte |
|---|---|
| Review consolidado, aceites e RF/RNF do PDF TCC I | docs/REVIEW-FASE-C.md |
| Roteiro manual completo com configuração aberta | docs/ROTEIRO-MANUAL-FASE-C.md |
| Evidência/contagens/inventário finais | docs/EVIDENCIAS-FASE-C-FINAL.md |
| Histórico C anterior | docs/VALIDACAO-FASE-C.md |
| Protocolo metodológico v3 | docs/experiments/protocol.md |
| SQLs originais preservados | experiments/operations/ |
| Arquivamento do legado | archive/legacy-phase-c/README.md |

Fases A/B preservadas como evidências/definição histórica; não há atualização automática do Notion.
