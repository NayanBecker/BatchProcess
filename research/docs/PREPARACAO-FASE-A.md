> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Preparação reproduzível — Fase A

## 1. Escopo e segurança

A Fase A valida instalação, configuração, migrations e consultas básicas da CLI. **Não é experimento de desempenho e não comprova o processamento de jobs.** Não há carga massiva nem carga concorrente nesta etapa.

- Fonte: `M:/ProjetoTcc/Processamento_em_loteV5`.
- Banco original: `postgres`. **Não aplicar migrations/rollback nele.**
- Banco autorizado: **`tcc_framework_test`**, no container já existente `dbpostgres`.
- Conexão a partir do host Windows: `127.0.0.1:5432`.
- O mesmo container armazena os dois bancos; o isolamento é lógico, não de CPU/memória/I/O.
- Nenhum container existente precisa ser recriado ou ter o volume removido.
- Os comandos npm de preparação recusam outro nome de banco. Isso é proteção operacional, não substitui permissões do PostgreSQL: SQL manual e o Knex chamado diretamente podem contorná-la.

## 2. Pré-requisitos e versões validadas

- Node.js **22.22.2** e npm **10.9.7**. `package.json` exige Node >=22.22.2; versões superiores não foram testadas nesta entrega.
- PostgreSQL **17.4** disponível. Docker é usado no ambiente observado, mas a aplicação roda no **Windows**, não dentro do container.
- Dependências instaladas pelo lockfile: Knex 3.1.0, pg 8.18.0, TypeScript 5.9.3, ts-node 10.9.2, @types/node 25.2.3. A dependência transitiva lodash foi atualizada de 4.17.23 para 4.18.1 após alerta do audit.
- Veja [AMBIENTE-FASE-A.md](AMBIENTE-FASE-A.md) para hardware, imagem/digest, recursos Docker e serviços externos observados. O repositório ainda não fornece Compose do ambiente experimental; não se pressupõe que tags Docker mutáveis reproduzam a imagem atual.

No diretório do projeto:

```bash
node --version
npm --version
npm ci
npm run build
npm test
```

No Git Bash deste Windows, se `node` responder `stdin is not a tty`, use `node.exe` para chamadas diretas. Os scripts npm foram executados normalmente.

O build remove **somente `dist/`** antes de compilar, para não conservar jobs/migrations antigos. Não guarde arquivos manuais nesse diretório. Em falha de TypeScript, `noEmitOnError` impede emissão incompleta. `dist/` foi retirado do índice do Git e passou a ser ignorado; é sempre regenerável por build.

## 3. Arquivo local de configuração

Crie `.env` **na raiz do projeto** copiando `.env.example`, somente se ainda não existir. Não sobrescreva um `.env` já preenchido. Edite a senha localmente; não envie a senha em chat, logs ou commits.

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=tcc_framework_test
DB_USER=postgres
DB_PASSWORD=
DB_POOL_MIN=0
DB_POOL_MAX=10
```

A senha vazia é intencional **apenas no exemplo**: preencha no `.env` com a credencial do servidor disponível. `DB_NAME`, `DB_USER` e `DB_PASSWORD` são obrigatórios; a aplicação falha antes de conectar quando estão vazios. Porta e limites do pool são validados; mínimo não pode superar máximo.

### Como o carregamento funciona

1. `src/db/config.ts` usa `loadEnvFile`, nativo do Node, sem adicionar dotenv.
2. O `.env` padrão é resolvido pela localização do módulo, tanto em `src/db` quanto em `dist/db`, e não pelo diretório corrente.
3. Variáveis já presentes no processo têm precedência sobre `.env` — inclusive uma variável vazia. Confira sobrescritas herdadas se o destino não for o esperado.
4. Opcionalmente, `BATCH_ENV_FILE` seleciona outro arquivo. Prefira **caminho absoluto**; caminho relativo é relativo ao diretório corrente. Arquivo explicitamente selecionado e inexistente produz erro, sem fallback silencioso.
5. `.env` ausente é permitido se todas as variáveis necessárias vierem do ambiente. Não há fallback implícito de nome de banco para `postgres`.
6. `src/.env` antigo não é carregado; foi preservado localmente e retirado do índice. `.env` e `.env.*` são ignorados, com exceção de `.env.example`.

Aplicação (`conection.ts`, nome mantido por compatibilidade) e migrations (`knexfile.ts`) consomem a mesma função `databaseConfig()`.

**Credenciais antigas:** retirar valores do fonte e arquivos do índice não remove segredos de commits históricos. Considere a rotação de credenciais que já foram versionadas/expostas; o histórico não foi reescrito. Não foi alterada a senha do servidor nesta fase.

## 4. Disponibilidade do banco de testes

No ambiente de Nayan o banco já existe; **não execute a criação novamente sem conferir**. Consultas somente de leitura:

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
docker exec dbpostgres psql -U postgres -d tcc_framework_test -X -c "SELECT current_database(), current_user, version();"
```

Em outra preparação com servidor já disponível e banco ainda inexistente, a criação equivalente é:

```bash
docker exec dbpostgres createdb -U postgres --owner=postgres tcc_framework_test
```

Esse último comando altera o servidor e exige permissão. Não remove, renomeia nem copia o banco original. Para servidor fora do Docker, o administrador deve criar o mesmo banco e fornecer host, porta e credencial correspondentes. Acesso via container/`psql` não substitui o teste TCP da aplicação:

```bash
npm run db:check
```

Saída validada: `Destino confirmado: tcc_framework_test (usuário postgres).` A função consulta `current_database()`; não imprime a senha. A conexão de runtime também foi validada diretamente e pelos comandos de consulta da CLI.

## 5. Migrations do núcleo

```bash
npm run migrate
```

O comando usa TypeScript, caminhos absolutos de migrations e checa o banco configurado **e o banco real** antes da DDL. Conjunto ativo:

- `001_create_batch_jobs.ts`
- `002_create_batch_job_errors.ts`
- `003_create_batch_job_logs.ts`
- `004_add_job_metadata.ts`

Após a aplicação, `public` contém `batch_jobs`, `batch_job_errors`, `batch_job_logs` e as duas tabelas de controle `knex_migrations`/`knex_migrations_lock`. **Não cria `users` nem `contacts_user`.** Uma nova chamada a `migrate` deve informar zero migrations executadas.

Use os scripts npm acima para migrations. O histórico usa nomes `.ts`; não misture execução de migrations compiladas `.js` no mesmo histórico. O executor compilado de preparação recusa execução e orienta usar o fonte. A CLI de aplicação compilada é suportada normalmente.

### Rollback — destrutivo, somente em banco de testes descartável

```bash
npm run db:check
npm run migrate:rollback -- --confirm=tcc_framework_test
npm run migrate
```

O rollback reverte o **último lote aplicado pelo Knex**, não necessariamente todo o histórico de qualquer banco. Na preparação nova validada, as quatro migrations estavam no mesmo lote. Remove as tabelas/dados do núcleo; as tabelas de controle do Knex permanecem. A confirmação não é substituto de backup. Sem o argumento de confirmação, o comando falha antes de conectar.

Na validação desta entrega: schema completo → rollback das quatro migrations → apenas tabelas de controle → reaplicação das quatro → schema completo. Evidência: [migrations-cycle.txt](evidencias/migrations-cycle.txt).

**Histórico antigo:** `002_create_users.ts` foi movida para `examples/legacy/migrations`. Se estiver registrada em outro banco, não use automaticamente este novo conjunto; planeje a compatibilidade daquele histórico antes de agir. Não apague registros de `knex_migrations` para silenciar erros.

## 6. CLI sem jobs históricos

```bash
npm run dev -- --help
npm run dev -- jobs
npm run dev -- list
npm run dev -- status 1
npm run dev -- logs 1

npm start -- --help
npm start -- jobs
npm start -- list
npm start -- status 1
npm start -- logs 1
```

Resultados esperados na base preparada e vazia:

- `--help`: ajuda, sem necessidade de configuração/conexão de banco.
- `jobs`: `Nenhum job encontrado.` O catálogo ativo vazio é intencional.
- `list`: `Nenhum job encontrado.`
- `status 1`: `Job não encontrado.`
- `logs 1`: `Nenhum log encontrado.`
- Comandos de consulta encerram o pool e saem normalmente; ID inválido é rejeitado.

`npm start -- list` executa a CLI compilada com o comando `list`; **não inicia um job**. O subcomando `start <nome>` é diferente e mantém o worker contínuo. Não foi validado com jobs nesta fase. Um nome não registrado é rejeitado antes de iniciar o gerenciador.

Exemplos antigos estão em `examples/legacy/`, fora do build e do carregamento da CLI. `src/jobs/` começa sem classes ativas. Não há necessidade de recriar suas tabelas; novos jobs serão produzidos após os ajustes funcionais. A exclusão preexistente de `NormalizeUserEmailsJob.ts` foi preservada.

## 7. Suítes e evidências

```bash
npm run build
npm test
npm run test:integration
npm audit
```

- `npm test`: testes sem acesso real ao PostgreSQL; inclui configuração, proteção do executor de migrations, CLI offline e ausência de artefatos antigos. Requer build prévio para conferir `dist`.
- `npm run test:integration`: requer **`tcc_framework_test` preparado sem execuções em `batch_jobs`** e build atualizado. Recusa outro destino; não apaga registros para preparar o teste. CLI faz consultas, e testes das migrations criam schema lógico próprio **dentro de transação revertida ao final**, inclusive em caso de falha.
- O ciclo destrutivo completo de migrations é explícito na seção anterior; não é disparado por `npm test`.
- `npm audit` depende do catálogo remoto na data da chamada; resultado zero não é garantia permanente nem substitui revisão do código.

[VALIDACAO-FASE-A.md](VALIDACAO-FASE-A.md) descreve comandos realmente executados, problemas reproduzidos, correções e limites das evidências.

## 8. Limites para a próxima etapa

Não foram executados jobs antigos, benchmarks, carga concorrente ou coleta Prometheus/Grafana. Pausa/retomada, consistência de checkpoint, retries, cancelamento de timeout, recuperação após falhas e concorrência do núcleo seguem pendentes. A Fase B deve definir a mesma operação e conjunto inicial de dados para monolítico e batch; os ajustes funcionais da Fase C precisam preceder os experimentos.
