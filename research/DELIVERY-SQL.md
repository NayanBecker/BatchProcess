# Entrega: entrada SQL FILE

## Resultado e escopo

O catálogo público padrão agora usa `{sqlFile, table, operation?}`. Não exige classe TypeScript nem hooks JS. O SQL aprovado de conversão CNPJ está em `jobs/converter-cnpj.sql`, com `:inicio` e `:fim`; o exemplo geral é `jobs/normalize-label.sql`. O seed CNPJ é opcional, sintético e separado em `examples/sql/create-cnpj-synthetic.sql`.

A CLI conserva init/jobs list/register/run/status/logs/errors/pause/resume/cancel/recover. Caminhos SQL são relativos ao JSON de configuração, iguais em dev/dist. INSERT exige targetTable explícita e mantém table como origem da paginação; DELETE calcula o limite antes da remoção. Compatibilidade avançada TS e jobs de pesquisa foram preservados.

Nenhuma migration/dependência nova, .env, segredo, licença ou publicação. As mudanças anteriores no worktree/research/archive não foram revertidas, commitadas ou publicadas. Não se executou workload em postgres/backup/origem: somente fixtures pequenas em tcc_framework_test, após db:check.

## Definição imutável

register valida e persiste `transactional_state.sqlDefinition` no JSONB existente: versão 1, texto UTF-8 exato, SHA-256, operação, tabela de paginação, destino e dataSchema. H e configuração continuam persistidos no cadastro. run/resume/recover não abrem novamente o arquivo; executar edição requer novo cadastro. Hash/metadados são verificados no model, manager e guard transacional. Catálogo e destino precisam continuar compatíveis. Status apresenta sqlHash/sqlOperation, nunca o SQL completo.

O SQL unqualified é suportado por SET LOCAL search_path TO pg_catalog, dataSchema, na trx de domínio/checkpoint; controle continua qualificado. Knex named value bindings preservam casts ::TEXT e protegem strings/comentários contra substituição. O resultado pg CommandComplete deve coincidir com a operação; usa rowCount, sem adicionar RETURNING.

## Envelope e limites declarados

Scanner lexical (não apenas startsWith): aspas simples/duplas duplicadas, E-strings, dollar strings, comentários de linha/bloco aninhados, casts, bindings reais e delimitadores. Exige ambos :inicio/:fim reais e rejeita parâmetros desconhecidos/identificadores, múltiplos statements, DDL/transações, WITH modificador/geral, MERGE e RETURNING. Ponto e vírgula único final e comentários/whitespace são aceitos. UTF-8 estrito, máximo 1 MiB, hash sem trim/case folding, preservando BOM/CRLF.

É deliberadamente conservador, **não parser SQL completo nem sandbox**. Não prova o WHERE, imutabilidade do id, ausência de efeitos de funções/triggers, fontes auxiliares ou escrita indireta. SQL e privilégios são responsabilidade do operador confiável. INSERT ON CONFLICT DO UPDATE não faz parte do subconjunto. A sequência barra invertida imediatamente seguida de ponto de interrogação é recusada mesmo em literal/comentário: o posicionador de parâmetros Knex altera essas barras; fail-closed evita modificação silenciosa. Interrogação simples em string/comentário é preservada.

SQL fica durável no controle: não colocar PII/segredos em literais e restringir acesso ao snapshot. Logs/errors armazenam falha genérica, sem SQL/mensagem PostgreSQL/stack sensível. completed continua sendo conclusão operacional, não certificação de integridade.

## Verificação executada nesta entrega

| Comando | Resultado real final |
|---|---|
| `npm ci` | 56 packages instalados, audit 57, 0 vulnerabilities |
| `npm run build` | sucesso, build limpo de dist |
| `npm start -- --help` | sucesso, UX pública sem laboratório |
| `npm start -- jobs list --config batcheman.config.example.json` | normalize-label e converter-cnpj, ambos SQL |
| `node --test tests/unit/sql-job.test.cjs` | 8/8 |
| `npm test` | **63/63**, sem falhas/skips |
| `npm run db:check` | destino confirmado tcc_framework_test |
| `npm run test:integration` | **66/66** (57 testes top-level incluindo subtestes), sem falhas/skips |
| `node -r ts-node/register --test --test-concurrency=1 observability/*.test.cjs` | **5/5**, incluindo fixture HTTP real |
| `git diff --check` | exit 0; apenas avisos Git LF/CRLF no worktree Windows |
| Leitura catalogada de schemas phase_c_test no banco permitido após suites | **0 schemas restantes** |

Foram observados RED e GREEN na introdução do contrato SQL/catálogo e no escape não suportado. Uma tentativa inicial da integração foi mascarada pelo finally de cleanup após falha de init enquanto dist ainda era antigo; não conta como reprodução funcional. Com build atualizado, a integração completa e sua repetição final passaram, e a leitura final de catálogo confirmou limpeza.

### Assertivas independentes

- `tests/unit/sql-job.test.cjs`: casts/bindings, strings/comentários/pontuação, múltiplos statements, parâmetros ausentes/desconhecidos, hash alterado, drift de metadados/catálogo, model sem snapshot antes de abrir transação, BOM/UTF-8/limite e distinção origem/destino INSERT.
- `tests/integration/sql-workflow.test.cjs`: CLI dist monolithic e dev batch; usa o arquivo CNPJ real e seed sintético real dentro de schemas privados. Cinco linhas lacunares, zero, NULL, destino previamente preenchido, ids acima de Number.MAX_SAFE_INTEGER. Assertivas esperadas escritas independentemente do SQL: três alterações, cinco visitados, um commit A ou três B. Editar o arquivo para DELETE após register não muda a execução UPDATE registrada.
- Na mesma integração, INSERT copia cinco linhas em três commits e DELETE remove cinco linhas em três commits, validando origem versus destino. Um CHECK real no checkpoint falha **depois de DML bem-sucedido**, revertendo domínio/cursor/commits; errors não contém SQL/dados. Após remover CHECK e apagar o arquivo, recover/run concluem o snapshot original. Pause após primeiro commit, arquivo removido, resume/run concluem sem repetir prefixo (cinco visitados/três commits).
- `tests/integration/public-workflow.test.cjs` agora usa o arquivo normalize-label.sql real, com dev/dist, A/B, status/logs/errors, pausa/cancelamento e rollback de erro SQL. Esperados seis visitados/cinco alterações, um commit A/três B.
- Suites existentes de checkpoint/ownership/crash/recovery/observabilidade e laboratório permaneceram verdes.

## Arquivos desta alteração SQL

Novos: `src/core/sqlDefinition.ts`, `src/core/SqlJob.ts`, `jobs/normalize-label.sql`, `jobs/converter-cnpj.sql`, `examples/sql/create-cnpj-synthetic.sql`, `tests/unit/sql-job.test.cjs`, `tests/integration/sql-workflow.test.cjs`, este relatório.

Adaptados sobre o worktree anterior: `src/core/runtimeConfig.ts`, `src/cli/public.ts`, `src/core/TransactionalBatchJob.ts`, `src/core/TransactionalOwnership.ts`, `src/core/JobManager.ts`, `src/core/BatchExecutor.ts`, `src/db/models/BatchJobModel.ts`, `batcheman.config.example.json`, `README.md`, `src/jobs/README.md`, `tests/unit/public-cli.test.cjs`, `tests/integration/public-workflow.test.cjs`.

## Comandos de uso

Após configurar banco/controle próprios e variável passwordEnv, preparar a tabela externamente e executar init:

```bash
npm start -- jobs list
npm start -- register converter-cnpj --mode batch --batch-size 2 --throttle 0
npm start -- run ID
npm start -- status ID
npm start -- logs ID
npm start -- errors ID
```

Substituir ID pelo id retornado. O README principal segue o exemplo normalize-label; o contrato detalhado está em `src/jobs/README.md`. Esta entrega não afirma execução em clone real, benchmark nem certificação de dados pessoais.

## Aceite final

Aceito pelo agente principal no escopo de SQL confiável e limitado, após repetir build, db:check, 63 unitários, 66 integrações e diff-check com sucesso. Revisão independente sem bloqueadores; o revisor leu implementação/testes, executou os oito testes unitários SQL e a ajuda da CLI, sem acessar banco/segredos. Permanecem as limitações do envelope descritas acima: parâmetros obrigatórios não provam que o autor limitou corretamente o WHERE, nem restringem efeitos de funções/triggers. Nenhuma publicação foi realizada.
