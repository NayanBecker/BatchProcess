> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Review consolidado — Fase C

> **HISTÓRICO SUPERADO quanto à superfície validate/restore e contagens.** Por decisão posterior do usuário, a ferramenta de comparar resultados/dados e o reset foram removidos de src/build/CLI/API/wrapper. Estado completed/failed, error_count, logs/errors, detecção de falhas SQL/checkpoint, validateInitial/guards/rollback permanecem ativos. completed não certifica dados. Consulte STATUS-TCC.md e o roteiro atual; comandos antigos abaixo não devem ser executados.

## Escopo atual e decisões autorizadas

Esta revisão substitui as pendências de **certificação do caminho legado** dos relatórios anteriores: por autorização do usuário, o caminho item/processItem, retry/Promise.race e CLI sem destino foram arquivados em `archive/legacy-phase-c/`, fora de `src`, build e glob de testes. Manager, registry, executor set-based, iterator e modelos compartilhados continuam ativos. Os SQLs originais em `research/experiments/operations/` não foram modificados. Não há commit/push/reset desta entrega.

O protocolo v3 permanece a referência A/B. O review genérico original deixou a conexão em aberto. A autorização posterior do backup Docker descartável foi implementada e exercitada: ver [TESTE-BACKUP-LOCAL.md](TESTE-BACKUP-LOCAL.md). `research/config/clone.example.json` continua inválido até configuração explícita; `config/backup_testes.json` admite somente o destino privado fixo autorizado. Não altera `.env` ou a conexão global das fixtures. Não habilita benchmark nem cópia das 17 milhões de linhas.

**Entrega exercitável:** EXP-06 UPDATE, EXP-08 INSERT SELECT/cópia e EXP-09 DELETE. As mesmas funções SQL atendem A (uma transação) e B (por lote). EXP-09 marca SC em comando separado, antes da janela DML; fronteira de B seleciona exclusivamente IDs elegíveis, sem OFFSET, antes da remoção. EXP-08 exige destino vazio para nova execução, nunca usa ON CONFLICT DO NOTHING e não apaga origem.

## Proteções e contexto

- Manual/clone proíbe `postgres` e `tcc_framework_test`. `backup_testes` continua proibido por padrão, com única exceção `authorizedDisposableBackup: true` + destino exato `backup_testes/review_data/benchmark_control`, allowlist, confirmação e schemas de posse verificada. Fixtures continuam exclusivamente em `tcc_framework_test` com schema aleatório `phase_c_test_<32 hex>`; custom schemas não abrem exceção global.
- Config manual exige conexão explícita, database de conexão = target, data/control schemas privados diferentes (sem public/pg_*/information_schema), opt-in `customSchemas: true`, allowlist exata `DB/DATA_SCHEMA/CONTROL_SCHEMA` e a mesma string em `--confirm` em todos os comandos. Tabelas fixas: `teste_socios`, `teste_destino`, `teste_migracao`; não há argumento SQL.
- Cada transação confere `current_database()` na conexão real. Criação/progresso e escrita de log/erro dos modelos compartilhados requerem contexto explícito; não há fallback de persistência para public/global.
- Estado durável conserva destino database/control/data schema. Um contexto diferente não pode adquirir execução pendente nem redirecionar a retomada. Lock de sessão, token e DML/checkpoint usam a mesma conexão física; nenhuma troca de conexão para continuar após perda.
- `check` é dry-run sem DDL/DML de domínio. `prepare`, `mark`, `run` exigem o SHA-256 do último check sobre target, operação, dataset e dados atuais; alteração invalida o token. Preparação, admissão e restore são serializados por lock administrativo; restore recusa pending/running/paused/failed para não destruir trabalho recuperável.
- Review manual é intencionalmente pequeno: até `maxRows <= 1000` por tabela, tipos/colunas controlados, BIGINT PK/UNIQUE NOT NULL positivo, sem RLS, triggers externos, regras, herança ou FK de domínio/cascade. Não apontar as tabelas integrais do clone neste review: serão recusadas. Isso não é runner de campanha massiva.
- Snapshot JSONB com checksum canônico no controle privado; nenhuma execução de SQL vindo do snapshot. Restore é **reset destrutivo de dados**, com confirmação separada; valida schema atual, recupera conjuntos/valores e mantém histórico. Não repara DDL adulterado nem certifica backup real. A restauração de schema/PK da fixture JSON continua coberta pelo módulo `restore.ts`.

## Evidências funcionais

Suítes novas: `manual-dml`, `review-runner`, `review-safety`, `target-identity`, `model-context`, `job-audit`, `job-timing`; unitários de clone config/context/CLI, escopo ativo e timing. O runner é exercitado **por API injetada fixture-only**, com data/control schemas separados e cleanup com posse. A CLI manual nunca é apontada a Docker/tcc_framework_test.

- A/B EXP-06 com esperado independente para NULL/vazio/acentos/espaços; EXP-08 compara conjuntos e origem; EXP-09 compara sobreviventes exatos e visitados elegíveis, incluindo ID acima da precisão de Number.
- Review completo em fixtures: check, recusa token errado, prepare, mark separado, A, validate independente, restore, novo check, B, validate e restore; histórico permanece completed.
- SQL/checkpoint com rollback; conflito INSERT aborta lote sem esconder duplicação; DELETE guarda cursor antes de remover. Morte real antes/depois do commit, perda real de backend e exclusividade entre processos permanecem na regressão.
- Pausa é pedido, não confirmação; parada durável entre lotes, resume/recover reenfileiram e dispatch executa. Modo A não promete pausa parcial. Shutdown aguarda executores próprios e libera mapas; sinal nativo Windows não foi certificado, somente evento Node simulado.
- Statement/lock_timeout SQL reais e sem retry automático. Orçamento total e timeout por item são recusados; código JS que nunca termina não tem cancelamento genérico/deadline prometido.
- Logs de transição/checkpoint pós-commit e erro/contador após falha são persistidos sem refazer DML. Auditoria auxiliar é best-effort: conexão perdida pode impedir seu registro; estado/checkpoint duráveis continuam autoridade. Erro persistido é mensagem genérica controlada, sem valores pessoais/SQL/segredos; erro original é devolvido ao caller. Retry transacional = zero, não métrica legada inventada.
- Timing separa parede, ativo e pausado, acumula entre retomadas e sinaliza `timingUncertain` em recovery com intervalo órfão desconhecido. Tempo ativo é operacional delimitado por checkpoints, inclui throttle/controle e não é latência por item nem cronômetro de benchmark. A pequena cauda entre gravação do checkpoint e ACK não é estimada como medição exata. Testes puro com relógio controlado e integração pausa/retomada confirmam separação; períodos desconhecidos não viram ativo fictício.

## RF/RNF — fonte primária e cobertura, sem renumerar

Fonte consultada por extração de texto do PDF local `C:/Users/nayan/AppData/Local/hermes/profiles/project-tcc-worker/attachments/Trabalho de TCC I - Nayan Tobias Becker.pdf`, seção 5.3, **Quadros 2 e 3, página impressa 22**. O texto extraído junta células e hifeniza palavras, mas IDs/descrições abaixo são identificáveis; não foi inferida cobertura pelas nomenclaturas de teste.

| Requisito do PDF | Cobertura desta entrega / limite |
|---|---|
| RF01 iniciar job por nome previamente registrado | Registry preservado; jobs fixos registrados e executados via fixture/manual com destino explícito; CLI legado foi removida intencionalmente |
| RF02 persistir jobs/estados pending/running/paused/completed/failed/cancelled | Estados duráveis exercitados, pedidos separados de confirmação e recovery explícito |
| RF03 batch com lotes configuráveis | A/B, limites, lacunas, BIGINT, H e lote final/vazio; apenas operações 06/08/09 disponibilizadas |
| RF04 logs por job com mensagens/status/data/hora | Modelos contextualizados; logs de transições/checkpoints e comandos logs; gravação auxiliar best-effort, não garantia de auditoria após perda da conexão |
| RF05 status detalhado/métricas | DTO/config efetiva, contadores textuais, timing, list/status/logs/errors; dashboards externos são Fase D |
| RF06 pausa/retomada preservando progresso | Multiprocesso, prefixo, H/cursor/config e posse exercitados; recuperação não automática |
| RF07 limite máximo de jobs simultâneos | Reserva síncrona/exclusividade local, limite seguro de um worker de review. Não alegar suporte operacional a concorrência arbitrária só porque parâmetro existe |
| RF08 registrar/contabilizar erros | Teste rollback + failed + error_count=1 + erro persistido, sem retry; perda de conexão pode deixar auditoria incompleta |
| RNF01 batch/progresso sem degradação significativa | Comportamento funcional verificado; desempenho/ausência de degradação NÃO demonstrados por fixtures, depende Fases D/piloto |
| RNF02 retomada/persistência | Fixtures de crash/conexão/recovery; perda real da resposta COMMIT na rede não exercitada |
| RNF03 histórico de logs/contadores | Modelos privados/sem public e restore conserva histórico; best-effort na indisponibilidade do banco |
| RNF04 ajuste concorrência/múltiplos processamentos | Exclusividade e disputa multiprocesso demonstradas; escalabilidade/concorrência de vários jobs massivos não habilitada/certificada |
| RNF05 modular/extensível | Manager/registry/modelos reutilizados, config/timing puros e funções SQL compartilhadas; não constitui avaliação formal de manutenibilidade |

## Limitações/gates explícitos

1. **Revisão independente aceita pelo agente principal.** Os quatro achados foram conferidos como fechados, sem bloqueador remanescente. Fase C encerrada no escopo DML ativo EXP-06/08/09, com legado arquivado e limites desta matriz preservados.
2. COMMIT: wrapper que descarta confirmação e crash pós-commit são testados. Não houve corte TCP precisamente na resposta COMMIT; não declarar teste real de perda da resposta, exactly-once ou rollback global de B. Recovery exige lock/protocolo, relê estado durável e não repete prefixos confirmados.
3. Config e execução real do clone ficaram deliberadamente para o usuário. Não há backup real certificado, benchmark, instrumentação Prometheus/Grafana ou evidência de desempenho/escalabilidade.
4. Restore de review é dados/schema controlado já compatível. Histórico failed/paused/pending exige recuperação/conclusão ou cancelamento cooperativo antes de reset; não existe apagar checkpoints automaticamente para forçar restore.
5. Preparação exclusiva/imutabilidade externa continua precondição. Operadores/admins não devem alterar schemas/dados entre check e commits; guard não neutraliza um superuser malicioso.
6. A configuração de concorrência é validada, mas review executa um job por contexto/manager; fila/polling do legado foi arquivada, não certificada nem substituída por um serviço automático de campanha.

## Correções dos quatro achados da revisão final — conferidas e aceitas

- Identificadores canônicos ASCII minúsculos, até **63 bytes UTF-8**, compartilhados em config/modelos/iterator e validação da tabela durável; sem truncamento ou normalização. Prefixos comuns que seriam aliases PostgreSQL são recusados antes de pool/lock. Unicode não é aceito.
- Pause/cancel/resume/recover/delete conferem destino durável sob lock de linha antes de alterar/deletar. Caminho manual confere contexto também; cinco ações negativas preservam integralmente row/dados nas fixtures.
- Throttle limitado a **2147483647 ms** pelo mesmo guard no CLI/API/modelo antes de persistência; overflow de setTimeout não é permitido.
- AbortSignal sticky por comando impede admissão após SIGINT/SIGTERM mesmo depois de stop limpar stopping. Checks antes de criar/dispatch e sob locks antes do INSERT/aquisição; testes com evento Node simulado durante check admin e abort nas validações tardias. Sem certificação de sinal nativo.

RED relevante e GREEN registrados em EVIDENCIAS. Regressão atual: build exit 0, **39/39 unitários, 51/51 integração** (parents/subtestes incluídos), diff-check exit 0; db:check confirmou tcc_framework_test. Cleanup final é consulta read-only. **Revisão independente concluída por leitura de fontes/testes; agente principal reexecutou a regressão e aceitou o encerramento.** Clone real continua não executado.

## Regressão final

Resultados finais e inventário estão em `research/docs/EVIDENCIAS-FASE-C-FINAL.md`; a execução registrada ali deve ser consultada, não os totais históricos de `VALIDACAO-FASE-C.md`. Alteração do escopo arquivou testes legados deliberadamente e adicionou testes do contrato ativo; números não são comparáveis por simples soma.

Roteiro do usuário: `research/docs/ROTEIRO-MANUAL-FASE-C.md`. Nenhum comando de clone deste roteiro foi executado nesta sessão.
