> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Evidências da entrega Fase C — regressão após correções da revisão

> **HISTÓRICO SUPERADO quanto à superfície validate/restore e contagens.** Essas ferramentas de resultados/reset foram retiradas da aplicação. STATUS-TCC.md registra a regressão atual; conclusão/falha, logs/errors e segurança operacional permanecem no framework. Não executar comandos antigos deste relato.

Situação: **Fase C concluída no escopo DML transacional ativo EXP-06/08/09**, com legado arquivado. Agente principal reexecutou build, db:check, 39 unitários e 51 integrações, todos verdes, e diff-check sem erro. Re-review independente fechou os quatro achados por leitura de fontes e testes (sem executar suíte própria). Parecer aceito pelo agente principal; limites abaixo preservados.

## Comandos realmente executados após os quatro achados da revisão

| Comando | Resultado |
|---|---|
| npm run build | exit 0 |
| npm run db:check | tcc_framework_test confirmado |
| npm test | 39 testes; 39 aprovados; zero falhas/skips/cancelled/todo |
| npm run test:integration | 51 testes; 51 aprovados; zero falhas/skips/cancelled/todo |
| git diff --check | exit 0; avisos LF/CRLF apenas |
| npm start -- manual --help | exit 0; ajuda com prepare/check/run/validate/restore e controles |
| consulta catálogo pg_namespace | current_database=tcc_framework_test; remaining_fixture_schemas=0 |

Teste manual/clone real NÃO executado: configuração deixada em aberto pelo usuário. Os comandos do modo manual foram exercitados em contexto de fixture injetado e protegido nos testes, não no clone real nem nos bancos experimentais protegidos.

Totais anteriores 37/39 são históricos: testes do caminho legado foram arquivados por autorização; suíte ativa ampliada. Não somar as contagens como testes únicos.

Preservação: sem commit/push/reset. Build regenera dist ignorado. Nenhuma alteração de credenciais ou redirecionamento da conexão global nesta verificação. Nenhuma campanha ou medição de desempenho foi executada.

## Correções reproduzidas e regressão (parecer independente aceito)

- **P1 identificadores/locks:** validador compartilhado aceita somente `[a-z_][a-z0-9_]*`, até 63 bytes UTF-8, sem truncar/normalizar. Database/schema/table são recusados antes de pool/preparação/fronteira; tabelas duráveis são conferidas na aquisição. Schema de fixture já tem formato/tamanho fixos. Prefixos comuns de 63 bytes com sufixos distintos não podem virar aliases físicos aceitos; Unicode é recusado, não há suporte novo a identificadores Unicode. Chaves de lock continuam usando a identidade completa agora validada.
- **P2 controles:** pause/cancel/requeue/delete conferem alvo durável sob FOR UPDATE antes de UPDATE/DELETE; requeue/delete mantêm posse de sessão. Caminho manual confere também antes de controles/leitura/dispatch. `target-identity` contém cinco subtestes para pause/cancel/resume/recover/delete com data schema distinto, comparando row inteira e dados após recusa.
- **P2 throttle:** `validateThrottleMs` compartilhado exige inteiro 0..2147483647 na resolução, CLI fixture/manual e modelos antes de persistência. Overflow não vira timer Node de 1 ms. Testes exercitam limite sem aguardar timer longo, import/create/transaction traps e zero persistências.
- **P2 admissão após sinal:** AbortController pertence à execução do comando manual, não ao estado temporário de `manager.stop()`. Review confere sinal sob lock administrativo imediatamente antes da criação e antes do dispatch; modelo confere antes do INSERT, executor confere sob locks de sessão/linha antes de pending→running. Evento **Node SIGINT simulado** durante check administrativo real da fixture aguarda stop terminar e prova zero novas execuções/aquisições/DML. Abort durante validação inicial e validação do executor cobre as janelas tardias; sinal nativo Windows não foi certificado.

### RED/GREEN observados

| Regressão | RED observado | GREEN |
|---|---|---|
| `identifier-limits` | duas falhas: schema longo aceito e tabela longa alcançou DB | 2/2 |
| `target-identity` | pause/cancel/resume/recover/delete: cinco recusas ausentes (mais parent failed) | 6/6 contando parent/subtestes |
| `review-target` | status de contexto distinto aceito | 1/1 |
| `throttle-limits` + `manual-cli` | overflow aceito ou importou banco/pool | 3/3 |
| `manual-admission` | evento injetado confirmado; sem propagação do sinal, run/dispatch admitiram trabalho; sem guards tardios, INSERT foi aceito e executeBatch foi alcançado | 6/6 contando parents/subtestes |

A primeira tentativa de injetar SIGINT por atribuição a `trx.raw` não entregou sinal (accessor Knex). O teste foi corrigido para Proxy e passou a exigir contador de injeção fora de listeners. RED efetivo foi reexecutado com a propagação/guards novos temporariamente desabilitados e depois restaurados; nenhuma desabilitação permaneceu. Uma inicialização de manager sem config no teste de throttle também foi corrigida. Estes problemas de harness não são apresentados como reproduções válidas dos bugs.

Contagens atuais incluem parents/subtestes Node: **39 unitários e 51 integração**, zero failures/skips/cancelled/todo. Não somar o baseline 34/40 às novas contagens. Testes exercitam código real com fixtures pequenas e doubles somente nas bordas de configuração/pool/import/interceptação; não há assertions novas escondidas em error/event listeners.

### Arquivos desta correção

Criados: `src/core/identifiers.ts`, `src/core/admission.ts`, `tests/unit/identifier-limits.test.cjs`, `tests/unit/review-target.test.cjs`, `tests/unit/throttle-limits.test.cjs`, `tests/integration/manual-admission.test.cjs`.

Ajustados: cloneConfig/reviewRunner; TransactionalOwnership/BatchIterator/BatchExecutor/jobConfig; modelos BatchJob/Log/Error; CLI manual/fixture; testes manual-cli/target-identity; este relatório, REVIEW e STATUS. Build regenera somente dist ignorado. Skill de fixtures do **perfil ativo** recebeu regras reutilizáveis de limites, fencing, sinal sticky e interceptação Knex.

**Aceite registrado:** regressão reexecutada pelo agente principal e re-review independente sem bloqueadores dos quatro achados. Encerramento limitado ao escopo ativo; legado segue arquivado; nenhuma conexão ao clone real, descoberta de credenciais, alteração de .env/deps, commit/reset/push, benchmark ou escrita em bancos protegidos/public.

## Limitações

- Perda de resposta de COMMIT: simulação no cliente; não teste real de rede. Crash/perda de backend são testes separados.
- Timing ativo/pausado/parede possui definição operacional; recovery registra intervalo desconhecido sem inventar atividade.
- Review manual restrito a até 1000 linhas/tabela e schemas privados controlados. Não usar tabelas de milhões nem remover limites para campanha.
- Certificação do backup real, clone real, observabilidade e benchmarks permanecem posteriores.

Fontes para review: research/docs/REVIEW-FASE-C.md, research/docs/ROTEIRO-MANUAL-FASE-C.md, research/docs/VALIDACAO-FASE-C.md e STATUS-TCC.md.
