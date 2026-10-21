> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Fase C — validação incremental do núcleo

> **HISTÓRICO SUPERADO:** validate de resultados e restore retirados da aplicação/build/CLI/API. O antigo módulo restore.ts agora é helper sintético em tests/helpers/fixture-artifact.ts, fora do build. Não executar comandos históricos abaixo; consulte STATUS-TCC.md e roteiro atual. Checagem operacional de conclusão/falhas e guards continuam obrigatórios.

> **Estado atual (2026-10-13):** consultar `REVIEW-FASE-C.md`, `ROTEIRO-MANUAL-FASE-C.md` e `EVIDENCIAS-FASE-C-FINAL.md`. Usuário autorizou arquivar o legado fora do código/testes/validações ativos; os gates de certificação do legado abaixo são históricos, não obrigações reabertas. Manager/registry/modelos compartilhados foram preservados. Config manual do clone LOCAL está em aberto; nenhum clone/benchmark foi executado. RF/RNF foram consultados no PDF e mapeados com limitações. Revisão independente final pelo parent continua pendente.

## Histórico anterior (não é o estado atual)

**Situação: implementação parcial, não encerrada.** A continuação mais recente acrescenta shutdown coordenado do manager, serialização de polling, CLI transacional dev/compilada, contenção real de lock, controle em A e restauração funcional de fixture. Preserva posse `session-affine-v1` na mesma conexão de DML. **Não certifica C6 legado, Fase C inteira ou campanha.** A seção seguinte é o estado atual; as seções anteriores preservadas abaixo registram entregas históricas e seus limites à época.

## Correções da revisão independente — 2026-10-12, 20:11:48 -03:00

**Dois P2 corrigidos; Fase C permanece parcial.** Esta revisão pontual não fecha os gates legados, métricas, revisão integral nem mapeamento RF/RNF.

### Achados e correções

1. **Limites divergentes:** o resolver aceitava `batchSize=2147483647`, mas a fronteira exige `LIMIT batchSize+1`; a CLI admitia SQL timeout `2147483648` até importar o banco, enquanto o modelo o recusava depois. `validateBatchSize` e `validateSqlTimeouts`, em `src/core/jobConfig.ts`, agora são compartilhados: batch inteiro de **1 a 2147483646**, SQL timeouts inteiros de **0 a 2147483647**, ausência permitida. Resolver/iterator/CLI/modelo usam a mesma validação de batch; CLI/manager/modelo usam a mesma validação de SQL timeout. CLI rejeita antes do require de conexão, manager antes de chamar criação, modelo antes de iniciar transação. Zero não é perdido. `LIMIT=2147483647` foi verificado com double de consulta, sem alocar fixture gigante.
2. **Pausa fantasma no legado:** `requestPause` chamava UPDATE condicionado a running, recebia undefined para cancelled, mas emitia `jobPaused`. Agora somente emite quando o retorno confirma paused; o tipo de `BatchJobModel.pause` explicita undefined. Linhas completed/failed também encerram o loop sem novo fetch/transição. Cancelamento que vence o UPDATE continua cancelled, sem notificação de pausa. O teste de shutdown usa manager, executor e modelo reais com double de persistência, verifica estado/evento e mapas drenados; não certifica controle remoto ou posse multiprocesso do legado.

### Evidência RED → GREEN

Comandos direcionados: `node --test tests/unit/input-limits.test.cjs` e `node --test tests/unit/executor-pause.test.cjs`.

- Batch: RED `Missing expected exception` para limite antes aceito; GREEN **1/1** após compartilhar limite.
- Timeout: RED `Error: database imported` em vez da rejeição esperada; GREEN **2/2** após validação pré-import/pré-criação.
- Pausa: RED `1 !== 0` no contador jobPaused para cancelled; GREEN **1/1** com emissão condicionada ao retorno.
- Terminais: RED `terminal must not fetch` para completed; GREEN **2/2** após guarda completed/failed.
- Reforços de regressão sobre os mecanismos corrigidos: extremos/NaN/Infinity/zeros/omissão, lookahead máximo sem volume grande, running→paused confirmado, corrida cancel versus UPDATE, terminais com pedido e shutdown/mapas. Não são apresentados como RED adicionais inexistentes.

### Regressão executada

```text
npm run db:check                    -> Destino confirmado: tcc_framework_test (antes da integração)
node --test --test-concurrency=1 tests/unit/input-limits.test.cjs tests/unit/executor-pause.test.cjs
                                    -> tests 9; pass 9; fail 0
npm run build                       -> exit 0 (tsc)
npm test                            -> tests 37; pass 37; fail 0
npm run test:integration             -> tests 39; pass 39; fail 0
                                       cancelled 0; skipped 0; todo 0
consulta read-only de cleanup       -> {"database":"tcc_framework_test","remainingFixtureSchemas":0}
git diff --check                    -> exit 0; aviso LF/CRLF preexistente em cli.test.cjs
```

**Arquivos desta correção:** `src/core/jobConfig.ts`, `src/core/BatchIterator.ts`, `src/cli/fixture.ts`, `src/core/JobManager.ts`, `src/core/BatchExecutor.ts`, `src/db/models/BatchJobModel.ts`; novos `tests/unit/input-limits.test.cjs`, `tests/unit/executor-pause.test.cjs`; este relatório atualizado. Build regenera dist ignorado. Plano/protocolo consultados, sem alteração. Trabalho local anterior preservado. Sem `.env`, dependências, commits/push/reset, migrations em public, escrita em postgres/backup_testes/origem ou benchmark. A integração repetiu somente o escopo protegido de fixtures existentes em tcc_framework_test.

**Pendências mantidas:** ciclo legado resume/controle remoto/delete/posse, retry/timeout legado, contexto completo, consolidação C1/C2, tempos ativo/pausado, perda real da resposta COMMIT na rede, backup real/campanha, revisão integral e RF/RNF. Estes dois P2 não equivalem ao encerramento da Fase C.

## Continuação atual — 2026-10-12, 19:54:54 -03:00

### Resultado executado

```text
npm run db:check                    -> tcc_framework_test confirmado antes da integração
npm run build                       -> exit 0
npm test                            -> tests 28; pass 28; fail 0
npm run test:integration             -> tests 39; pass 39; fail 0
                                     cancelled 0; skipped 0; todo 0
git diff --check                    -> exit 0 (aviso LF/CRLF, sem erro)
consulta read-only de cleanup       -> {"database":"tcc_framework_test","remainingFixtureSchemas":0}
```

Nenhum commit/push/reset, instalação, alteração de `.env`, migration em public, escrita em postgres/backup_testes/origem ou benchmark. Alterações locais anteriores preservadas. Nova preparação recusa fontes acima de 1000 registros; o teste negativo usa somente 1001 linhas sintéticas, sem executar transformação sobre elas.

### Incrementos funcionais e evidências

- **Shutdown:** `stop()` bloqueia admissões, desliga timer, solicita pausa somente a executores próprios e aguarda poll em voo e promises rastreadas. Não consulta todos os jobs running do banco. Drena trabalho mesmo após falha de poll. Reserva transacional anterior ao primeiro await permanece protegida; executor criado durante shutdown recebe pedido local antes de DML. Integração mantém DML em voo, exige que stop aguarde, libera lote e verifica paused/cursor/prefixo, mapas vazios e outra execução intocada.
- **Polling legado:** polls simultâneos compartilham uma aquisição, em vez de ultrapassar slots durante await. Mapas são liberados em finally, inclusive retorno por cancelamento. Listeners completed/failed não repetem transições persistidas pelo executor e não liberam o slot antes do término. Essas propriedades legadas foram verificadas com doubles de persistência/execução nos unitários; não representam certificação multiprocesso do legado.
- **Controle A:** pedido de pausa durante a transação global espera sua linha; após commit único, é recusado porque A já está completed. Não há resultado parcialmente pausado em A.
- **Timeout:** teste de contenção segura mantém `FOR UPDATE` na linha da fixture em outra conexão. `lock_timeout=40` retorna PostgreSQL `55P03`, deixa status failed, commits/cursor zero e nenhum DML tardio após liberar o bloqueador. O teste de statement_timeout real continua verde. Isso não é orçamento total, timeout de aquisição de posse ou cancelamento de JavaScript arbitrário.
- **CLI `fixture`:** run A/B, status, pause/cancel (pedidos), resume/recover (somente pending), dispatch explícito, delete protegido e restore. Parâmetros estritos, destino explícito e verificação do banco real. EXP-06 usa apenas `teste_socios`. Flags batch/throttle e limites SQL persistem; configuração/estado exibidos são DTOs do mesmo modelo. Ajuda e argumentos inválidos não importam conexão. `start NormalizeSocioNamesJob` legado é recusado antes de iniciar polling. Execução/restauração reais verificadas em dev e compilada, com pools encerrados e erros exit 1.
- **CLI de controle separada:** outro processo solicita pausa, verifica request ainda running, reenfileira, recupera explicitamente paused e despacha. Resultado conserva três commits totais/BIGINT; cancelamento tardio é recusado e delete é confirmado por leitura. API de pause/cancel/delete continua sob os controles de posse anteriores.
- **Sinais:** handlers SIGINT/SIGTERM chamam shutdown, não process.exit. Sinal durante guard inicial bloqueia admissão posterior. Teste injeta **evento Node SIGINT**, não sinal nativo Windows; não apresentar isso como certificação de entrega de sinal pelo sistema operacional. O teste real de DML em voo exercita `manager.stop()` diretamente.
- **C9 funcional restrito:** `src/experiments/restore.ts` gera artefato/manifest, valida formato e SHA-256, restaura schema/dados/PK em uma transação e compara dados antes do commit. `inspectFixture` confere catálogo de colunas/defaults/nulabilidade/constraints e fingerprint ordenado por id. `tests/fixtures/exp06-v1.json` é artefato controlado efetivamente gerado, lido e restaurado; checksum do conteúdo canônico: `cca0ab5de1865c7cb02004f511512e2e404a7a87d86c39d357890dfb84f1fe0e`.
- **Proteções da restauração:** somente tabela literal `teste_socios`, no schema de fixture e banco real autorizado, até 1000 registros; nenhuma instrução SQL de arquivo é executada, nem DROP CASCADE. Recusa schema com tabela `batch_jobs`, mesmo sem linhas, para não invalidar histórico/checkpoints. Recusa adulteração, tabela original, public e campos extras; IDs decimais sem perda, NULL/vazio distintos. Recusa de bancos protegidos é testada com resposta de conexão simulada, sem conectar ou escrever neles. Restauração recompõe coluna inesperada removida e PK, dados e nulos; não restaura o banco inteiro.

### Uso disponível (não cria schema nem migra public)

Em schema **já pertencente a fixture controlada**; `SCHEMA` é placeholder e não um destino válido literal:

```text
npm run dev -- fixture --help
npm run dev -- fixture restore --database tcc_framework_test --schema SCHEMA --artifact tests/fixtures/exp06-v1.json
npm run dev -- fixture run --database tcc_framework_test --schema SCHEMA --mode B --dataset exp06-fixture-v1 --batch-size 1 --throttle-ms 0 --statement-timeout-ms 2000 --lock-timeout-ms 100
npm start -- fixture status --database tcc_framework_test --schema SCHEMA --id 1
npm start -- fixture resume --database tcc_framework_test --schema SCHEMA --id 1
npm start -- fixture dispatch --database tcc_framework_test --schema SCHEMA --id 1
```

Restore exige schema sem controle/histórico; run exige controle já instalado **apenas na fixture**. A suíte prepara migrations 001/004/005 com guard na conexão, usando helper e cleanup. Não usar `npm run migrate` para preencher essa lacuna em public. Cada nova preparação A/B usa fixture nova; restore não apaga checkpoints para permitir reexecução. Não há certificado de backup real ou equivalência física/cache.

### Matriz de aceite atual (escopo completo versus pendências)

| Critério do plano | Estado e limite atual |
|---|---|
| Configuração resolvida/persistida e parâmetros | Verificado no contrato transacional e CLI; consolidação de tipos/concorrência/config legada ainda pendente |
| EXP-06 A/B e esperado independente | Verificado em fixtures; não implica disponibilidade de EXP-01–09 |
| DML/checkpoint/finalização atômicos | Verificado em A/B, falha SQL/checkpoint e eventos pós-commit |
| Morte antes do commit | Processo real, rollback e recovery explícito verificados |
| COMMIT confirmado sem notificação | Simulação de confirmação descartada e crash pós-commit verificados; perda real da resposta na rede ainda não exercitada |
| Lacunas/BIGINT/H/vazio/lote final | Verificado; imutabilidade externa continua pré-condição |
| Pause/resume/posse/polling | Fixtures verificadas com processos reais; polling local serializado por unitário. Ciclo legado de resume/controle remoto ainda não certificado |
| Timeout real/rollback | Statement e lock de domínio verificados, sem retry novo; orçamento total recusado e retry/Promise.race legado pendente |
| Shutdown/recursos | Manager aguarda trabalho próprio e limpa mapas/timer; handler de sinal testado por evento simulado. Não há deadline/cancelamento genérico JS ou validação nativa de sinais Windows |
| Eventos/métricas | Contadores transacionais duráveis e BIGINT verificados; tempos ativo/pausado e métricas de retry legado pendentes |
| Restauração/proteções | Funcional para artefato sintético EXP-06; não certifica seis auxiliares, backup real ou restauração de campanha |
| INSERT/DELETE/regressão/revisão | Casos representativos e regressão verdes; revisão independente e RF/RNF com fonte TCC I pendentes |

**Gates restantes, sem alegar conclusão total:** ciclo de vida legado continua com APIs que podem publicar paused antes da parada e resume→running em vez de pending; posse remota/delete legado não recebe a garantia do novo protocolo. Também faltam tratamento robusto de falha de dispatch legado após aquisição, contexto completo dos modelos/logs, retry legado seguro, consolidação C1/C2, schema de controle independente, tempos ativo/pausado, teste de perda real da resposta COMMIT, revisão independente e mapeamento RF/RNF. O novo caminho de fixtures não habilita benchmark e não usa polling legado. Shutdown espera trabalho/throttle; não promete limite temporal se código de job nunca termina. Restauração presume preparação exclusiva, sem worker ou preparador externo concorrente.

### TDD e arquivos desta continuação

RED→GREEN observados: stop voltava antes do DML; polls sobrepostos; run legado não rastreado; transição completed duplicada; falha de poll encerrava drain cedo; módulo de restauração ausente; inspect aceitava schema alterado; comando fixture ausente; restore CLI ausente; start legado abria banco antes de recusar transacional; sinal durante guard permitia admissão; preparação aceitava volume acima de fixture. Testes de lock_timeout, controle em A e reforços de proteções foram regressões adicionais sobre mecanismos já existentes, sem alegação de RED inexistente.

Falhas intermediárias resolvidas: testes legados precisaram row com batch_size/throttle válidos; TypeScript do projeto não aceita Array.at; imports dinâmicos NodeNext exigiam extensão, substituídos por require tipado/lazy; resolver defaults legados na CLI reintroduzia retry/timeout por item, corrigido passando somente overrides ao resolver do manager.

Novos: `src/cli/fixture.ts`, `src/experiments/restore.ts`, `tests/fixtures/exp06-v1.json`, `tests/integration/fixture-cli.test.cjs`, `tests/integration/restore.test.cjs`, `tests/unit/manager-shutdown.test.cjs`, `tests/unit/restore-safety.test.cjs`.
Alterados nesta continuação: `src/cli/index.ts`, `src/core/BatchExecutor.ts`, `src/core/JobManager.ts`, `src/db/models/BatchJobModel.ts`, `tests/integration/checkpoint.test.cjs`, `tests/integration/job-lifecycle.test.cjs`, `tests/unit/cli.test.cjs` e este relatório. Demais alterações locais pertencem às entregas anteriores preservadas.

## Histórico — ambiente e evidência da entrega anterior

- Verificação final da continuação: 2026-10-12, 19:30:27 (UTC-03), branch `BatchProcessor_v7`.
- HEAD inicial/final: `022f7b568d158e0c9521294dff37ff04940718c6`; alterações desta entrega estão **sem commit/push**.
- Estado inicial da primeira entrega: somente o plano não rastreado. Na continuação, todas as alterações C0–C5 e este relatório já existiam; foram preservadas, sem reset/commit/push.
- `npm run db:check`: destino real confirmado **tcc_framework_test** antes da integração.
- Integração inicial da Fase A: **8/8**, nenhuma falha.
- Nenhuma alteração de `.env`, dependências ou observabilidade. Nenhuma escrita executada em postgres, backup_testes ou origem.
- Fixtures sintéticas com poucos registros, schemas `phase_c_test_<UUID sem hífens>`; DDL e commits reais, sem transação externa ocultando commits.
- Consulta final somente leitura: `{"database":"tcc_framework_test","remainingFixtureSchemas":0}`.
- Migration 005 aplicada **somente nas fixtures**; não foi executado `npm run migrate` sobre public. Para criar novos jobs legados com esta versão, aplicar 005 pelo procedimento protegido em etapa autorizada; o modelo agora persiste `effective_config`.

### Regressão final executada

```text
npm run build                       -> exit 0
npm test                            -> tests 20; pass 20; fail 0
npm run test:integration             -> tests 28; pass 28; fail 0
                                     cancelled 0; skipped 0; todo 0
 git diff --check                    -> exit 0
```

O Git avisou que LF de `tests/unit/cli.test.cjs` será convertido a CRLF numa futura operação; não houve erro de whitespace. Tempos de fixtures não são resultados experimentais do TCC.

## Implementado e observado

| Área | Evidência real | Limite do aceite |
|---|---|---|
| C0 isolamento | Helper recusa bancos protegidos e cleanup sem posse; sucesso/falha removem schema; regressão A verde | Concluído para a suíte executada |
| C1 contrato/config | Resolução profunda, precedência e zeros; validação antes de persistir; novo contrato sem `processItem`; registry existente; rejeita retry, checkpoint esparso e timeout legado no modo novo | Consolidação total dos tipos e validação de concorrência/configuração legada ainda pendentes |
| C2 persistência | Migration 005 up/down/up em fixture preserva cursor legado; configuração recarregada igual ao DTO; contexto explícito e rollback de updateProgress; H e contadores decimais no JSONB | Contexto ainda não propagado a todos os modelos/logs/controles legados; benchmark_control não criado |
| C3 fronteiras | IDs 1, 9 e 9007199254740993; limite fixo H; linha acima de H excluída do alvo; vazio, lote final menor, remoção antes da próxima busca; SELECT somente id com bindings | DELETE representativo remove todos os IDs da fixture; seleção específica de elegíveis migrado=TRUE do EXP-09 ainda não adaptada |
| C4 atomicidade | Erro após DML/checkpoint reverte dados e cursor; A reverte tudo, B mantém prefixo; conclusão no último commit; observador falho não reexecuta lote. Agora também crash real antes/depois do commit e reconciliação do prefixo | Confirmação de COMMIT perdida foi **simulada no cliente**, não perdida na rede; não afirmar exactly-once |
| C5 EXP-06 | Manager → registry → executor → operação compartilhada em A/B; NULL, vazio, acento, espaços; esperado independente; A 1 commit, B 3 commits | Baseline é modo A do mesmo executor. Resume pelo manager não refaz preparação inicial. Testes de resume usam operação sintética não idempotente, não nova certificação de EXP-06 |
| C6 posse | Lock de sessão por execução na mesma conexão física dos commits; token e FOR UPDATE; pausa pedida separada da confirmação; requeue preserva H/cursor/contadores. Multiprocesso, crash, perda real de backend e tentativa tardia rejeitada; cancelamento/delete protegidos; slot experimental liberado em finally | Recuperação só explícita e com protocolo de posse comprovado. Polling legado, shutdown integrado e CLI de controle permanecem pendentes. Não certificar C6 inteiro |
| C7 timeout | PostgreSQL statement_timeout com pg_sleep: erro real, rollback e nenhuma escrita depois de espera; nenhum retry automático | lock_timeout configurado, mas contenção real ainda não testada. Orçamento total é recusado. Retry/Promise.race legado permanece fora da garantia |
| C8 métricas/CLI | DTO preserva BIGINT textual; taxa indisponível vira null em vez de número impreciso; vazio não gera Infinity; avgItemDurationMs é null para transacional; catálogo inclui somente o novo job além das exclusões históricas | CLI não executa EXP-06: start legado recusa contexto implícito. Tempos ativo/pausado, métricas de retry legado e controle separado ainda pendentes |
| C9 restauração | Não implementada | Nenhum artefato/manifest ou restore funcional certificado; backup real NÃO certificado |
| C10 DML/revisão | INSERT SELECT com conflito PK aborta lote sem ON CONFLICT silencioso e mantém prefixo; DELETE preserva cursor após remoção; regressão completa verde | Testes representativos estão em checkpoint.test.cjs; EXP-08/09 não são jobs disponíveis. Revisão independente pelo agente pai ainda necessária; RF/RNF não mapeados sem fonte TCC I |

## API e arquitetura desta entrega

- `TransactionalBatchJob` é contrato separado do job item-a-item, integrado ao `BatchExecutor.run`, ao registry existente e a `JobManager.runTransactional`.
- `runTransactional(name, {db, schema}, spec, config)` é **entrada síncrona e restrita a fixtures**; não é uma segunda fila ou framework. Recusa manager já executando polling. O fluxo legado permanece existente.
- Preparação usa `BatchJobModel.createTransactional`: valida banco real, schema restrito, identificador de tabela, coluna id inteira NOT NULL com chave única/PK por catálogo, positividade dos IDs e metadados; captura H durável. Não trava mutações externas durante todo o ensaio: a imutabilidade da fonte continua pré-condição do protocolo.
- H, cursor, visitados, alterados, inseridos, excluídos e commits são strings decimais em `transactional_state`, junto de modo/protocolo/dataset/operação/limites SQL. `processed_rows` representa visitados no novo modo.
- A faz domínio/progresso em uma transação; B seleciona fronteira antes da operação, executa DML/progresso/conclusão juntos e aplica throttle só entre commits. O SELECT de fronteira lê até batchSize+1 IDs para reconhecer o lote final sem pausa extra.
- `statementTimeoutMs` e `lockTimeoutMs` pertencem à especificação experimental; zero/ausência desabilita limite. São limites SQL, não orçamento total nem garantia de cancelamento de código JavaScript arbitrário. Configuração por item do legado é recusada no contrato novo.
- `NormalizeSocioNamesJob` não registra nem executa por import. A CLI descobre seu arquivo em jobs; listagem foi atualizada intencionalmente, mantendo teste que exclui os exemplos históricos.
- Novas execuções EXP-06 via manager exigem processado FALSE e nome_normalizado NULL. A operação mantém o predicado original; processado NULL é erro de preparação, não ampliação silenciosa do alvo.

## TDD e falhas observadas

Foram executados RED→GREEN incrementais para helper ausente, criação de fixture ausente, resolução de configuração ausente, merge raso de retry, validate ignorado pelo manager, estado/modelo transacional ausentes, fronteira ausente, contrato/execução transacional ausentes, EXP-06/entrada do manager ausentes, timeout real ausente, preparação inválida antes aceita, tabela sem chave antes aceita e divisão por zero do DTO. Casos de regressão adicionais de atomicidade, concorrência, INSERT/DELETE foram acrescentados sobre a implementação existente; não são apresentados como reproduções RED de bugs inexistentes.

Falhas intermediárias reais corrigidas: inferência `number | void` de update do Knex (aquisição agora usa returning id/length); teste antigo de catálogo vazio após adição intencional de EXP-06; assertion dentro de listener com erro isolado (assertion movida para fora do listener para não ser engolida).

## Próxima continuação obrigatória

1. Revisar o delta e fortalecer C1–C4: resolver tipos/config legada de ponta a ponta, contexto completo dos modelos e tabela de controle independente da fixture; validar todos os limites/IDs/escopos.
2. **C6 continua gate:** integrar APIs explícitas ao controle/CLI e encerramento do manager; serializar polling legado, corrigir stop para afetar apenas executores próprios e esperar término, remover transições duplicadas de listeners legados. A entrada experimental é síncrona e não usa esse polling. Pausa/retomada/posse/crash já têm evidências abaixo, mas não equivalem a shutdown completo.
3. Exercitar perda **real da resposta de COMMIT na rede**. Já há crash antes/depois, perda real de conexão durante DML e simulação de confirmação descartada; nenhum deles comprova sozinho a falha de transporte exatamente na fronteira do COMMIT. Não inferir rollback do erro do cliente.
4. Completar C7 (contenção/lock, orçamento total se suportado, restrição de retry legado), C8 (CLI/config/controle/métricas acumuladas) e C9 (artefato/manifest/checksum/restauração de fixture e proteções).
5. Completar matriz C10, revisão independente e mapeamento RF/RNF. Adaptar EXP-08/09 e outras operações separadamente; catálogo metodológico EXP-01–09 continua no protocolo, não equivale a implementações disponíveis.

Não foi declarada conclusão integral de C0–C4 nem da Fase C. Nenhum benchmark, certificação de backup, campanha massiva ou observabilidade foi executado.

## Continuação C6 — entrega funcional verificada

### Contrato implementado

- `TransactionalOwnership.ts`: `pg_try_advisory_lock(hashtextextended(schema + jobId, 0))` em conexão adquirida do pool. Lock de sessão e **todas** as transações de domínio usam a mesma conexão via `Knex.transaction(callback, {connection})`. API confirmada na implementação e tipos do Knex instalado, depois exercitada no PostgreSQL. Não há transação administrativa aberta atravessando todos os lotes, nem segunda conexão de lease que permitiria DML sobreviver à perda da posse.
- A perda dessa conexão perde também a transação em curso; o executor **não troca de conexão** para continuar DML ou marcar failed. Cada transação confere banco real; posse conserva token sob lock da linha. Unlock em finally; conexão sem confirmação de unlock é destruída em vez de devolvida utilizável ao pool.
- `BatchJobModel.requestTransactionalControl(id, 'pause' | 'cancel', context)`: persiste pedido no JSONB; não declara parada. Se houver lote em andamento, o pedido aguarda a linha do checkpoint. No próximo limite, executor confirma paused/cancelled e deixa o loop. Não cancela SQL em voo. No modo A, não existe pausa parcial dentro da transação global; pedido tardio pode encontrar completed e ser recusado.
- `requeueTransactional(id, context)`: exige paused e ausência de posse ativa, muda para pending sem alterar H/cursor/contadores/configuração. `requeueTransactional(id, context, {recover:true})`: recuperação explicitamente solicitada de running/failed/paused, sob o mesmo lock de sessão e protocolo `session-affine-v1`. Estados antigos sem esse protocolo, cancelados e concluídos não são recuperáveis por esta API. Idade do job não é usada como prova.
- `deleteTransactional(id, context)`: recusa posse ativa, running e protocolo antigo não comprovado. Usa o lock também para impedir corrida contra nova aquisição.
- `JobManager.runQueuedTransactional(id, context)`: despacha pending pelo registry e configuração durável, sem criar outra execução ou recalcular H. Reserva slot antes de await e libera worker em finally. `start()` agora recusa polling enquanto existe reserva experimental. Controles legados sem contexto não são os controles dessas fixtures; não misturar IDs de schemas diferentes.
- Continuação não exige nova migration: protocolo de posse/pedido ficam no JSONB da migration 005, somente em fixtures. O worker usa uma conexão fixa; controle simultâneo no mesmo processo precisa outra conexão disponível. Nenhuma garantia de cancelamento de JavaScript arbitrário foi acrescentada.

### Evidências novas

`node -r ts-node/register --test tests/integration/job-lifecycle.test.cjs`: **9/9** na execução direcionada; todos repetidos na suíte completa **28/28**.

1. Pedido não confirma parada; resume em **outro processo** conserva BIGINT/H/contagens, e incremento não idempotente termina exatamente `[1,1,1]`.
2. Estado antigo running sem protocolo de posse é recusado mesmo quando não há lock.
3. `pg_terminate_backend` somente sobre PID da conexão do filho da fixture durante DML: recuperação por novo dono, seguida de continuação do filho antigo, que é rejeitada sem commit tardio.
4. Morte real do filho após primeiro commit: prefixo/cursor duráveis preservados e outro processo conclui sem duplicar incremento.
5. Cancelamento entre lotes deixa apenas prefixo; delete ativo recusado e delete após parada confirmado por leitura.
6. Manager despacha requeue, utiliza batchSize persistido e libera slot mesmo quando dispatch é recusado.
7. **Simulação**: wrapper de transaction descarta o resultado de um commit já confirmado e lança erro; recovery relê cursor, não repete prefixo. É falha de entrega ao executor, não corte TCP nem perda real de resposta PostgreSQL.
8. Pedido durante DML: teste observa espera real `wait_event_type='Lock'` no PostgreSQL, libera lote, confirma apenas um lote antes de paused.
9. Filho morto antes de COMMIT: disputa entre processos e recovery enquanto ativo recusadas, rollback observado; depois da morte, recuperação explícita conclui sem repetição.

Unitário novo: tentativa de iniciar polling durante reserva experimental antes de primeiro await é recusada; suíte unitária **20/20**.

### TDD, falhas intermediárias e limites

RED→GREEN observados para API de controle ausente, recuperação de órfão bloqueada, recuperação insegura de estado antigo antes aceita, delete protegido ausente, dispatch reenfileirado ausente e início indevido de polling durante reserva. Testes adicionais de crash/conexão/controle são regressões reais sobre esses incrementos, não alegações de RED inexistente.

Na primeira versão do teste de perda de conexão, `pg_terminate_backend` retornou antes da liberação da posse e a recuperação foi corretamente recusada. O teste agora aguarda ausência do PID em `pg_stat_activity`, com limite, antes de tentar recuperar. Não foi adicionado retry automático de execução para mascarar essa condição.

Arquivos novos: `src/core/TransactionalOwnership.ts`, `tests/helpers/phase-c-worker.cjs`, `tests/integration/job-lifecycle.test.cjs`, `tests/unit/transactional-manager.test.cjs`. Alterados nesta continuação: `BatchExecutor.ts`, `TransactionalBatchJob.ts`, `JobManager.ts`, `BatchJobModel.ts` e este relatório. Nenhuma alteração em `.env`, migrations, dependências ou bancos protegidos. Consulta final: `{"database":"tcc_framework_test","remainingFixtureSchemas":0}`.

Pendências específicas: shutdown coordenado, polling e controles legados seguros, exposição CLI, teste dedicado de controle no modo A, teste de lock_timeout por contenção e orçamento total, tempos ativo/pausado e C9. **Não usar estes resultados como conclusão integral de C6–C8 nem como certificação de campanha.**
