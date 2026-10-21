# Fase C — Plano de implementação da confiabilidade do núcleo

**Status:** planejamento; nenhuma implementação ou operação no banco autorizada por este arquivo. Fase B permanece concluída como desenho.

**Goal:** garantir dados, estados e contadores corretos no contrato A/B antes de medir desempenho.

**Architecture:** evolução incremental do núcleo existente, preservando registry, CLI e jobs legados sem reativar exemplos históricos. Adicionar uma capacidade explícita de operação set-based transacional e contexto de persistência injetado; o mesmo SQL experimental atenderá A e B, sem criar um segundo framework independente.

**Tech Stack:** Node.js, TypeScript, Knex, PostgreSQL, node:test, Docker. Sem troca de stack, commit ou push automático.

---

## 1. Escopo e continuidade

Fontes: `docs/experiments/protocol.md` versão 3; plano original `2026-09-27_172403-retomada-conclusao-tcc2.md`, seção Fase C; fonte inspecionado na branch BatchProcessor_v7. Worktree com alterações anteriores preservadas.

O plano original divide C em CLI/configuração, ciclo de vida, transações, retry/timeout, concorrência/encerramento e métricas internas. Manter esses objetivos, executando primeiro os pré-requisitos transacionais. A observabilidade Prometheus/Grafana continua na **Fase D**; a campanha de benchmarks não faz parte da Fase C.

Decisões que não serão reabertas: Knex; A global e B por lote; checkpoint junto com DML; somente DML; EXP-06 inicial; postgres para benchmark, backup_testes preservado, tcc_framework_test para desenvolvimento; métricas visuais antes dos benchmarks.

**Ambiente da Fase C:** fixtures pequenas em schemas isolados de tcc_framework_test. Nenhuma transformação massiva em postgres; nenhuma escrita em backup_testes ou na tabela principal. Metadados do backup foram conferidos anteriormente, mas isso não certificou seu conteúdo/restauração.

## 2. Riscos observados no código — não falhas reproduzidas nesta sessão

| Referência | Evidência estática / risco a transformar em teste |
|---|---|
| `BatchExecutor.ts:43-46,126-136` | Contadores locais começam em zero; checkpoint separado e erro ignorado |
| `BatchExecutor.ts:88-124,144-150` | Processamento individual; falhas de item não impedem necessariamente completed |
| `BatchJob.ts:43-48,104` e `BatchIterator.ts:29` | Contexto não recebe trx; iterator consulta via db global |
| `BatchJob.ts:162-165` | Query interpolada, cursor number, sem H durável |
| `BatchJob.ts:181-219` | Retry item a item e Promise.race, sem confirmação de cancelamento SQL |
| `BatchJobModel.ts:103-127` | Aquisição já possui transação e FOR UPDATE; preservar isso, não alegar ausência de lock |
| `BatchJobModel.ts:133-145` | Checkpoint usa db global |
| `BatchJobModel.ts:161-165,234-244` | Resume põe running; polling seleciona pending |
| `JobManager.ts:76-80,350-371` | Polls podem se sobrepor antes da reserva da capacidade |
| `JobManager.ts:104-108` | Stop consulta todos os running, não apenas os próprios |
| `JobManager.ts:393-419` | Listener async repete transições já feitas pelo executor; revisar erros e liberação |
| `JobManager.ts:139-142,379-382` | Configuração parcial e propagação a reconstruir/testar |
| `BatchJobModel.ts:305-325` | DTO reconstrói defaults, retriesCount fixo e divisão por zero possível; duração/registros não é latência observada |
| `src/types/index.ts` e `BatchJob.ts` | Tipos de configuração duplicados; garantir uma resolução efetiva compatível |

Os testes/build da Fase A não foram reexecutados neste planejamento. Não reutilizar seus números como evidência atual da Fase C.

## 3. Desenho técnico proposto

### 3.1 Capacidade transacional sem quebrar jobs existentes

- Preservar BatchJob/processItem para o caminho legado, claramente identificado como não adequado ao benchmark transacional.
- Adicionar contrato discriminado para operação por lote (nome proposto `TransactionalBatchJob`, novo arquivo `src/core/TransactionalBatchJob.ts`), integrado ao registry, manager e executor existentes. Não obrigar o novo job a implementar um processItem fictício.
- Contexto novo carrega `trx`, intervalo `(lo,hi]`, H, ID da execução, configuração efetiva e contadores. Métodos de domínio aceitam trx obrigatória, nunca fallback silencioso ao db global.
- Operação EXP-06 em módulo compartilhado `src/experiments/operations/normalizeSocioNames.ts`. Job experimental e baseline invocam exatamente essa operação com limites diferentes.
- Injetar contexto de banco/schema no manager/modelos/executor. Manter compatibilidade das chamadas atuais, mas caminho experimental exige destino explícito. Qualificar tabelas; não depender de search_path global.
- Proposta de controle: mesma estrutura dos modelos do núcleo, com evolução de migrations, instalável no schema benchmark_control pelo futuro runner experimental dedicado. Não copiar lógica de checkpoint para um segundo modelo sem necessidade. Preservar histórico original e tabelas public do desenvolvimento.

### 3.2 Progresso e configuração duráveis

Persistir H, cursor, protocolo/dataset/operation version, modo A/B, configuração resolvida, contadores visitados/alterados/inseridos/excluídos e batches comprometidos. Migrar sem zerar execuções existentes; definir mapeamento de processed_rows para o modo novo. BIGINT em representação textual ou bigint internamente, serialização decimal explícita; não converter silenciosamente para Number em DTO/eventos/CLI.

Resolver configuração uma vez: defaults do job → defaults do manager → parâmetros explícitos. Preservar zeros válidos (throttle=0, retries=0). No caminho transacional, checkpoint obrigatório a cada commit; rejeitar configuração incompatível em vez de ignorar. Benchmark sem retry automático.

### 3.3 Ciclo de vida e posse

Uma única rotina persiste transições; eventos notificam depois da confirmação. Pausa/cancelamento cooperativos entre lotes, sem prometer parar no instante do pedido. Separar pedido de controle de confirmação de parada para impedir delete/retomada enquanto o executor anterior ainda existe. Resume reencaminha à aquisição e preserva H/cursor/contadores.

Limite inicial: um manager e um worker massivo; teste deve impedir dupla execução do mesmo job entre processos. Proposta de posse: lock de sessão por job em conexão dedicada, combinado com token de execução validado em cada commit. Ao perder conexão de posse, parar novas transações; token impede commit tardio de dono antigo. Retomada órfã somente explícita depois de demonstrar ausência de posse ativa. Se a integração segura desse mecanismo exceder o escopo, bloquear recuperação automática; jamais usar apenas idade do job como prova de abandono. Validar APIs Knex/PostgreSQL antes de implementar; isto é desenho, não mecanismo já disponível.

O lease/lock não deve segurar a linha de checkpoint numa transação que atravesse todos os lotes. Dimensionar conexões e liberação; não criar deadlock do próprio pool.

## 4. Forma de trabalho e verificações

Para cada tarefa abaixo: **(1)** escrever teste do comportamento ausente, **(2)** executar e observar falha pertinente, **(3)** aplicar ajuste mínimo, **(4)** repetir teste até verde, **(5)** executar regressão relevante e registrar evidência. Não inventar resultados esperados como obtidos.

Comandos existentes, a executar somente na implementação:
- Unitários: `npm test`.
- Build: `npm run build`.
- Integração existente: `npm run test:integration` — confirmar destino real tcc_framework_test antes.
- Teste específico proposto: `node -r ts-node/register --test tests/integration/<arquivo>.test.cjs`.

Usar `.cjs`/node:test, como a suíte atual, sem instalar outro test runner. Testes transacionais com commits reais precisam schemas isolados e cleanup em finally; **não envolver tudo numa transação externa revertida**, o que esconderia os limites de commit e impediria testes em outras conexões. Cleanup restrito ao schema de teste criado, nunca public inteiro. Não registrar nomes/documentos reais; fixtures sintéticas mínimas.

## 5. Sequência de tarefas

### C0 — Regressão e isolamento
**Arquivos:** testes existentes; criar `tests/helpers/phase-c-db.cjs` e `tests/unit/experiment-safety.test.cjs`.
1. Reexecutar build/unitários e integração A com destino confirmado; capturar estado inicial.
2. Teste que recusa postgres/backup_testes como alvo de fixtures e impede cleanup de schema não pertencente ao teste.
3. Criar helper de fixtures isoladas; confirmar limpeza em sucesso e falha.
**Aceite:** nenhuma escrita em outros bancos e suíte A continua verde. Mudanças preexistentes preservadas.

### C1 — Configuração efetiva e API transacional
**Alterar:** `src/core/BatchJob.ts`, `src/core/JobRegistry.ts`, `src/core/JobManager.ts`, `src/types/index.ts`.
**Criar:** `src/core/TransactionalBatchJob.ts`, `tests/unit/job-config.test.cjs`, `tests/unit/transactional-contract.test.cjs`.
1. Testar precedência/defaults/zeros, batchSize positivo, throttle não negativo, concorrência inteira e IDs válidos.
2. Definir contrato discriminado e resolver configuração sem perder campos aninhados.
3. Testar validate() antes de enfileirar; jobs inválidos não deixam execução pendente.
4. Testar registro legado e novo sem reativar exemplos arquivados.
**Aceite:** configuração usada = persistida = exibida; modo transacional rejeita checkpoint esparso/retry incompatível.

### C2 — Persistência e contexto de conexão
**Alterar:** `src/db/models/BatchJobModel.ts`, modelos de log/erro, conexão/configuração e tipos somente onde necessário.
**Criar:** próxima migration após inventariar histórico (nome proposto `005_add_transactional_state.ts`); `tests/integration/transactional-state.test.cjs`.
1. Testar schema explícito e injeção de trx, sem vazamento para public/global.
2. Implementar novos campos e configuração efetiva; migrations up/down/up em fixture.
3. Testar números acima da precisão segura de Number sem conversão com perda.
4. Testar que modelos são reutilizáveis em schema de controle sem alterar defaults legados.
**Aceite:** H/config/cursor sobrevivem reload; checkpoint pode integrar a transação de domínio. Schema benchmark_control não é criado em postgres nesta etapa.

### C3 — Fronteiras dos lotes e SQL parametrizado
**Alterar:** `src/core/BatchIterator.ts`; criar `tests/integration/batch-boundary.test.cjs`.
1. Testar dataset vazio, lacunas, lote final menor, H, linha inserida acima de H e limite BIGINT.
2. Buscar IDs/fronteira com parâmetros via trx; não carregar todas as colunas por SELECT * para uma operação set-based que não precisa delas.
3. Validar identificadores via catálogo/allowlist; valores são bindings.
4. Testar seleção dos alvos removíveis para DELETE sem OFFSET e cursor salvo antes da exclusão.
**Aceite:** intervalos não pulam nem repetem conjunto inicial; lote sem alteração avança; final reconhecido sem pausa artificial após último lote. Não usar cursor+B como quantidade de registros.

### C4 — Executor com DML e checkpoint atômicos
**Alterar:** `src/core/BatchExecutor.ts`, modelo de job, contrato novo; criar `tests/integration/checkpoint.test.cjs`.
1. Injetar erro depois do DML e antes do checkpoint: exigir rollback dos dois.
2. Injetar erro no checkpoint: exigir interrupção sem avanço do cursor.
3. Implementar transaction callback para fronteira, operação e progresso; tirar logs auxiliares da condição de sucesso de domínio.
4. Persistir conclusão no último commit; dataset vazio tem conclusão explícita.
5. Emitir progresso só depois do commit; falha de listener/log depois do commit não pode transformar dados confirmados em falsa falha transacional ou refazer o lote.
**Aceite:** erro não vira completed; contadores de tentativas revertidas não são somados; A reverte tudo, B preserva apenas lotes comprometidos.

### C5 — EXP-06 e baseline A
**Criar:** `src/experiments/operations/normalizeSocioNames.ts`, `src/jobs/NormalizeSocioNamesJob.ts`, `src/experiments/monolithic.ts`, `tests/integration/operation-equivalence.test.cjs`.
1. Fixtures de nomes nulos, vazios, espaços nas extremidades/internos, letras acentuadas e valores já corretos para teste de reexecução.
2. Executar mesma expressão UPPER(TRIM(nome)) e predicado processado=FALSE em ambos; separar pré-validação de nova execução da retomada parcialmente processada.
3. Testar A com um commit de domínio; B com commits por lote; sem loop item a item no novo caminho.
4. Restaurar fixture entre A/B e comparar cada resultado com esperado independente, incluindo colunas intocadas.
**Aceite:** zero divergências e contagens corretas. Baseline entra em src/experiments porque tsconfig atual compila apenas src; não presumir que experiments/*.ts seria compilado. Arquivos SQL originais continuam arquivados.

### C6 — Pausa, retomada, exclusividade e encerramento
**Alterar:** `src/core/JobManager.ts`, `src/core/BatchExecutor.ts`, `src/db/models/BatchJobModel.ts`, CLI.
**Criar:** `tests/integration/job-lifecycle.test.cjs`, `tests/integration/concurrency.test.cjs`, `tests/integration/recovery.test.cjs`.
1. Reproduzir paused→running não reenfileirado; corrigir aquisição após parada confirmada.
2. Testar pausa durante lote, aguardando confirmação, seguida de retomada em outro processo.
3. Serializar poll/reserva de slots; testar polling sobreposto e dois workers disputando um job.
4. Implementar posse/token com testes de perda de conexão, crash e commit tardio; proibir roubo de job ativo.
5. Usar finalização garantida dos mapas, pooling e timers; stop só afeta próprios executores; delete recusa job ainda pertencente a worker ativo.
**Aceite:** retomada preserva contadores/H/cursor, não duplica executor, não deixa slots presos nem transação aberta. Em A, pausa cooperativa só após a transação global; não prometer granularidade de lote inexistente.

### C7 — Timeout e política de falhas
**Alterar:** `src/core/BatchJob.ts`, executor e modelo de erros; criar `tests/integration/retry-timeout.test.cjs`.
1. Usar fixture com espera/lock controlado e comprovar cancelamento real no PostgreSQL, rollback e liberação.
2. Implementar limites de statement/lock no escopo da transação pelo mecanismo PostgreSQL/Knex validado; não confiar em Promise.race para cancelar SQL.
3. Distinguir orçamento total da operação e limite por statement; A e B não têm statements de mesma duração.
4. Novo modo aborta no primeiro erro sem retry automático. Rejeitar opção não suportada. Retry legado não deve entrar no modo transacional.
5. Reproduzir/restringir caminhos legados que possam iniciar nova tentativa sem término da anterior; não declarar cancelamento genérico de processItem arbitrário garantido.
**Aceite:** timeout não deixa escrita atrasada; contagem de tentativas/erros é real; timers limpos. Recuperação após resposta de commit perdida relê estado; não inferir rollback só pelo erro do cliente.

### C8 — CLI e métricas internas confiáveis
**Alterar:** `src/cli/index.ts`, JobManager, BatchJobModel, tipos; ampliar testes unitários/integração CLI e criar `tests/unit/job-metrics.test.cjs`.
1. Expor modo/catálogo experimental sem execução por import, batch/throttle/destino e configuração efetiva; ajuda/listagem sem abrir banco.
2. Permitir controle separado do worker: resume solicita fila, não declara processamento iniciado sem processo apto a despachar.
3. Contadores acumulados de commits; retries não implementados não podem aparecer como medidos. Dataset vazio não gera NaN/Infinity.
4. Separar tempo de parede, ativo e pausado; duração/registros não será chamada latência por item. Disponibilizar eventos/artefatos com protocolo, dataset e configuração para instrumentação posterior, sem inventar nomes Prometheus.
5. CLI dev/compilada, erro com exit code não zero, pool encerrado e nenhuma execução massiva implicitamente habilitada.
**Aceite:** CLI e banco concordam; contador não regride após resume; eventos não antecipam commit. Alteração intencional do catálogo exige atualizar o teste antigo de catálogo vazio, não desativá-lo.

### C9 — Restauração funcional e segurança experimental
**Criar posteriormente:** `src/experiments/prepare.ts`, `src/experiments/restore.ts`, `src/experiments/validate.ts`, `tests/integration/restore.test.cjs`.
1. Em fixtures, criar artefato e manifest, alterar dados/schema, restaurar e comparar antes/depois.
2. Testar recusa a backup_testes como destino e à tabela principal; não oferecer restauração de banco inteiro.
3. Preparação do schema de controle em banco de teste, mesma semântica do futuro postgres; não enfraquecer src/db/migrate.ts.
4. Planejar certificação/exportação da base real como tarefa explícita após conferir espaço e escopo; ainda não agendar cópia pesada ou sobrescrever postgres automaticamente.
**Aceite C:** procedimento demonstrado em pequeno volume e proteções verificadas. **Gate da campanha posterior:** backup real certificado e restauração real exercitada antes de benchmark; fixture verde não substitui isso.

### C10 — Casos DML representativos e revisão final
**Criar:** `tests/integration/insert-delete-contract.test.cjs`, `docs/VALIDACAO-FASE-C.md` (na implementação).
1. Além do EXP-06, testar INSERT e DELETE pequenos com falha/checkpoint para verificar contadores, conflito e cursor após remoção.
2. Manter EXP-01 a 09 no catálogo; adaptação completa de todos os jobs é entrega posterior incremental, não requisito para demonstrar a confiabilidade inicial do núcleo. Não declarar todos disponíveis por causa desses testes representativos.
3. Reexecutar build/unitários/integração, revisar código e conferir não regressão da Fase A.
4. Registrar teste, comando, saída, commit/worktree e limitação; mapear RF/RNF usando o TCC I antes de atribuir cobertura (não inventar RF01–RF08 pelo nome).
**Aceite:** relatório distingue observado, reproduzido, corrigido e ainda limitado. Não usar tempos de fixtures como resultados do TCC.

## 6. Matriz mínima de aceite da fase

- [ ] Configuração resolvida/persistida, identificação e parâmetros seguros.
- [ ] EXP-06 A/B em fixtures com mesma expressão e resultado correto independente.
- [ ] DML/checkpoint/finalização do progresso no commit correto.
- [ ] Erro de SQL/checkpoint e morte do processo antes do commit não avançam estado.
- [ ] Commit confirmado sem notificação ao cliente é reconciliado na retomada sem repetição indevida.
- [ ] IDs com lacunas/BIGINT, H fixo, vazio e lote final menor corretos.
- [ ] Pause/resume/crash mantêm progresso; um dono por job; polling respeita slots.
- [ ] Timeout real e rollback antes de qualquer nova tentativa.
- [ ] Cancelamento/shutdown não deixam recursos, slots ou processos órfãos.
- [ ] Eventos/contadores sem antecipação, dupla soma ou médias falsas.
- [ ] Restauração de fixture e proteção dos bancos/tabela original aprovadas.
- [ ] Testes INSERT/DELETE representativos, regressão A e relatório de limitações.

## 7. Entregas, sequência e limites

**Primeira entrega sugerida:** C0–C4, base transacional com testes pequenos. **Segunda:** C5–C7, EXP-06 e resistência a falhas/retomada. **Terceira:** C8–C10, CLI/métricas internas, restauração e evidências.

Pode-se avançar à preparação da Fase D após o marco de confiabilidade, sem interpretar isso como autorização de campanha. Antes da campanha, também concluir certificação da base real, jobs efetivamente selecionados, instrumentação, carga, piloto e matriz final.

Não fazem parte deste planejamento: instalar Grafana/Prometheus, executar as operações em milhões de registros, modificar backup, reativar jobs antigos, alterar stack, medir ganho de desempenho ou afirmar que batch é melhor.

A maior decisão técnica a validar por um pequeno teste na implementação é a injeção de contexto/posse sem quebrar a API legada. Se inviável incrementalmente, apresentar evidência e discutir alternativa; não reescrever o framework silenciosamente.

**Resultado deste turno:** apenas este plano salvo. Estado de código e banco não alterado; testes aqui descritos são propostos, não executados.
