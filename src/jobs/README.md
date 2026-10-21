# Criar jobs e configurar o destino

1. Escreva um arquivo UTF-8 com um DML, sem classe TS. Exemplos: [normalize-label.sql](../../jobs/normalize-label.sql) e [converter-cnpj.sql](../../jobs/converter-cnpj.sql).
2. Adicione ao JSON `"cnpj": {"sqlFile":"./jobs/converter-cnpj.sql", "table":"teste_cnpj", "operation":"UPDATE"}`. sqlFile é relativo **ao arquivo de configuração**, igual em dev/dist. Não precisa recompilar SQL. Campos desconhecidos e mistura sqlFile/module/export são recusados.
3. Confira jobs list, use init, register cnpj --mode batch --batch-size 1000 --throttle 0, e run ID. Consulte status/logs/errors. resume/recover reenfileiram; depois use run.

`table` é a tabela de **paginação por id**. UPDATE/DELETE devem escrever nela; INSERT exige `targetTable` explícita para distinguir origem/destino:

```json
{"copy":{"sqlFile":"./jobs/copy.sql","table":"source","targetTable":"destination","operation":"INSERT"}}
```

```sql
INSERT INTO destination (id, label)
SELECT id, label FROM source
WHERE id > :inicio AND id <= :fim;
```

H/cursor/fronteira usam source; INSERT conta destination. DELETE calcula a fronteira antes de remover. Nomes principais podem ser simples ou qualificados pelo dataSchema confirmado. A mesma trx executa SET LOCAL search_path TO pg_catalog, dataSchema; controle é sempre qualificado. operation é opcional, identificada no SQL e validada quando declarada.

## SQL com binding

- Um UPDATE, INSERT ou DELETE simples; ponto e vírgula final opcional, aceitando comentários/whitespace depois. Limite 1 MiB, UTF-8 estrito.
- Os valores obrigatórios :inicio e :fim precisam ocorrer fora de strings/comentários/identificadores. O operador deve escrever `id > :inicio AND id <= :fim` no predicado correto. A validação **não prova** a semântica/posição do WHERE.
- Knex named value bindings, sem interpolação; casts ::TEXT são preservados. O scanner distingue aspas duplicadas, E-strings, dollar strings, comentários de linha e blocos aninhados. Pontuação/bindings dentro desses trechos não contam.
- Rejeita parâmetros desconhecidos, bindings de identificadores, ?/$1 no código, múltiplos statements, BEGIN/COMMIT/ROLLBACK, DDL, WITH, MERGE, RETURNING e ON CONFLICT DO UPDATE. É um envelope lexical conservador, não parser SQL geral nem sandbox. PostgreSQL ainda valida a gramática.
- Contagens usam pg CommandComplete/rowCount com operação esperada, sem RETURNING automático nem materialização de milhões de registros.
- Limitação do binder Knex: a sequência barra invertida imediatamente seguida de ? é recusada inclusive em literais/comentários, em vez de ser alterada silenciosamente. Pontos de interrogação sem essa barra são preservados em literais/comentários.

SQL é código confiável do operador: revise funções, triggers, fontes auxiliares e privilégios. Guards conferem destino principal/catálogo, não ausência de escrita indireta. Não altere id, não use efeitos externos não transacionais e nunca trate esta validação como autorização para SQL não confiável.

## Snapshot e privacidade

register salva versão, texto exato, SHA-256 e metadados (operação/origem/destino/schema) em transactional_state.sqlDefinition, JSONB existente, sem migration nova. Não faz uppercasing/trim antes do hash. run/resume/recover usam **somente a definição cadastrada**, mesmo após editar/remover o arquivo. Para uma edição valer, registre outro id. Tipo SQL/tabelas/operação do catálogo e destino devem continuar compatíveis. Model/manager/guard transacional validam hash/metadados, sem reler arquivo.

Status expõe sqlHash/sqlOperation, não SQL. Logs/errors do executor omitem mensagens PostgreSQL/stacks/SQL potencialmente sensíveis. O snapshot contém SQL: restrinja acesso ao controle e não use literais com PII/segredos. completed é conclusão operacional, não validação do resultado.

## Compatibilidade TypeScript avançada

`"custom":{"module":"./jobs/MeuJob","export":"MeuJob","table":"source"}` continua disponível. Módulo relativo a src/dev ou dist/compilado, sem extensão. Estenda TransactionalBatchJob, implemente executeBatch usando somente trx recebida e retorne `{changed,inserted,deleted}` como strings. validateInitial é opcional e não deve modificar domínio. [NormalizeLabelJob.ts](NormalizeLabelJob.ts) é exemplo compatível, não o padrão. Código TS não tem snapshot; preserve-o durante execuções recuperáveis.

IDs devem ser positivos e únicos, int/int8 NOT NULL, até BIGINT assinado. H e cursor são strings para não perder precisão. H fixa o teto no cadastro, não congela conteúdo e não exclui alterações concorrentes. `processado` não é exigido. Cada execução precisa transformação compatível com commits parciais/retomada; efeitos externos não são transacionais. Preserve código/catálogo enquanto jobs forem recuperáveis.

## Configuração

Use o [exemplo único](../../batcheman.config.example.json). `connection.database` deve ser igual a `target.database`; dataSchema contém o domínio, controlSchema deve ser privado, dedicado e distinto. Identificadores canônicos minúsculos ASCII, no máximo 63 bytes; não são truncados. public é permitido para domínio, nunca para controle. A CLI confirma current_database() na conexão transacional e confere posse/compatibilidade do controle. init não cria/altera domínio.

A senha vem exclusivamente da variável nomeada em passwordEnv; .env histórico não é importado no caminho público. `jobs list` e ajuda não precisam senha/conexão. Opções de lote e throttle são validadas antes da abertura do pool no cadastro; max batch-size 2147483646, max throttle 2147483647 ms. Não são recomendações operacionais; comece pequeno em banco descartável.

Os antigos jobs EXP-06/08/09 permanecem para regressões do laboratório e não fazem parte do catálogo público padrão.
