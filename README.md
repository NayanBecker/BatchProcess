# BatCheman

Protótipo Node.js/TypeScript para executar DML no PostgreSQL em uma transação **monolítica** ou em **lotes com checkpoint durável**. Uso pelo repositório; 

## 1. Clonar, instalar e compilar

Clone **este repositório** pela URL mostrada no botão Clone do seu Git e entre na pasta clonada. Requer Node.js >=22.22.2, npm e PostgreSQL acessível.

```bash
npm ci
npm run build
npm link
bah --help
```

`npm link` disponibiliza o comando local `bah`, sem publicar o pacote. Execute os comandos na pasta do projeto para usar a configuração local; em outra pasta, informe `--config caminho.json`. Após mudanças em TypeScript, basta refazer `npm run build`, sem repetir o link. No PowerShell, se a política bloquear `bah.ps1`, use `bah.cmd` (não é preciso mudar a política de segurança). O formato anterior `npm start -- comando ...` continua funcionando.

## 2. Escrever um arquivo SQL

Não precisa escrever uma classe TypeScript. O catálogo padrão aponta para `jobs/normalize-label.sql` e `jobs/converter-cnpj.sql`. Um arquivo contém **um UPDATE, INSERT ou DELETE**, com os valores obrigatórios `:inicio` e `:fim`:

```sql
UPDATE teste_cnpj
SET cnpj_novo = LPAD(cnpj_antigo::TEXT, 14, '0')
WHERE cnpj_novo IS NULL AND cnpj_antigo IS NOT NULL
  AND id > :inicio AND id <= :fim;
```

Declare no JSON: `"converter-cnpj": {"sqlFile":"./jobs/converter-cnpj.sql", "table":"teste_cnpj", "operation":"UPDATE"}`. Caminhos SQL são relativos **ao arquivo de configuração**, tanto em dev como em dist. `table` é a tabela paginada por `id`; para INSERT, declare também `targetTable` como destino. Veja o contrato SQL abaixo.

## 3. Configurar um banco descartável e instalar o controle

Crie previamente um banco e usuário PostgreSQL próprios/descartáveis; não use banco de origem, backup principal nem servidor crítico. Copie o exemplo:

```bash
cp batcheman.config.example.json batcheman.config.local.json
```

Edite **somente o arquivo local**: host, port, user e database da conexão; repita o banco em `target.database` como confirmação explícita; escolha dataSchema e um controlSchema privado, distinto e ainda inexistente. O exemplo usa `public.demo_items` como tabela de domínio declarada no job. `public` nunca pode ser schema de controle.

Defina a senha no `.env` ao lado do arquivo de configuração. `connection.passwordEnv` indica o nome da variável: para usar `DB_PASSWORD` do seu `.env`, configure `"passwordEnv": "DB_PASSWORD"` no JSON local. A CLI lê somente essa variável, sem importar as demais configurações do `.env`. Uma variável já definida no terminal tem prioridade; remova-a do terminal se quiser usar o valor do arquivo. Não coloque senha no JSON, em comandos versionados nem no chat. A CLI não imprime conexão/SQL em erros; `.env` e o arquivo local são ignorados pelo Git.

```bash
bah jobs list
bah init
```

`jobs list` lê apenas o catálogo, sem conectar. `init` confirma o banco real na conexão e cria **somente** `batch_jobs`, `batch_job_errors`, `batch_job_logs` (estrutura 001–005) num schema dedicado com marcador de posse. É idempotente no controle compatível do usuário atual; recusa schemas preexistentes sem posse/incompatíveis. Não faz DROP, não instala tabelas de domínio e não executa migrations em public.

## 4. Preparar a tabela de domínio e cadastrar

Prepare sua tabela externamente. Opcional: o arquivo **sintético e separado** abaixo cria seis linhas e falha se a tabela já existir. Confira explicitamente o destino da conexão antes de executá-lo (o cadastro não cria tabela):

```bash
psql "$YOUR_DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f examples/sql/create-table-and-seed.sql
bah register normalize-label --mode batch --batch-size 2 --throttle 0
```

`register` retorna JSON com **id**, status `pending`, `highWater`, `sqlHash`, destino e configuração persistidos; não altera os dados de domínio. Salva o texto SQL UTF-8 e seu SHA-256 no estado JSONB existente, sem migration nova. **run/resume/recover executam a versão cadastrada**, mesmo se o arquivo for editado ou removido. Para executar uma edição, faça novo cadastro. Não coloque dados pessoais/literais sensíveis no SQL: o snapshot é durável, embora status/logs/errors não imprimam o texto SQL.

H limita a execução aos IDs até o cadastro; não é snapshot do conteúdo das linhas. A tabela deve ter `id` inteiro/BIGINT, positivo, único, NOT NULL e estável. Para experimentar CNPJ com cinco registros artificiais, use separadamente `examples/sql/create-cnpj-synthetic.sql` e depois `bah register converter-cnpj --mode batch --batch-size 2`; o resultado inicial é visited 5, changed 3, commits 3. Não execute esse seed em tabela pessoal/existente.

## 5. Executar e acompanhar

Substitua `ID` pelo número retornado; não digite literalmente ID:

```bash
bah run ID
bah status ID
bah logs ID
bah errors ID
```

Esperado no exemplo: `completed`, `visited: "6"`, `changed: "5"`, `commits: "3"`. NULL permanece NULL. Status/logs são estado operacional, não certificação de integridade dos dados. Logs/errors retornam os 200 registros mais recentes, ordem decrescente de id.

Para uma **nova execução monolítica**, use outro cadastro:

```bash
bah register normalize-label --mode monolithic --batch-size "(default 1000)"  --throttle
bah run ID
```

`register` aceita `--mode monolithic|batch`, `--batch-size` (default 1000) e `--throttle` em ms (default 0). Sem modo, usa batch. **Modo e opções ficam imutáveis naquele id**, inclusive após progresso/retomada; `run` não aceita alterações. Exemplo já normalizado pode mudar zero linhas; use conjuntos iniciais independentes para comparar modos, nunca reset automático.

Todos os comandos aceitam `--config caminho.json` para escolher outro arquivo explicitamente. Desenvolvimento usa os mesmos argumentos com `npm run dev -- ...`; após editar TS, recompile antes de usar `bah` ou `npm start`.

### Pausa, retomada e falha

Em outro terminal: `bah pause ID` ou `bah cancel ID` solicita parada de um job **running** na próxima fronteira transacional. Não interrompe DML em andamento nem desfaz lotes já confirmados. `bah resume ID` apenas reenfileira um job **paused**; depois execute `bah run ID`. Após crash/falha, `bah recover ID` exige posse livre e protocolo comprovado e reenfileira explicitamente; confira status/errors e o destino antes de executar novamente. Ctrl+C pede pausa cooperativa; uma transação longa pode demorar para responder.

Monolithic usa um commit de domínio; batch permite commits parciais. DML e checkpoint usam a mesma transação/conexão com posse de sessão. Não há retry automático, restauração, validação genérica de resultados, DDL em lotes ou garantia exactly-once para efeitos externos. SQL é de autoria **confiável do operador**, não sandbox. A validação lexical rejeita múltiplos statements, comandos transacionais/DDL, WITH e RETURNING; não prova a semântica do WHERE, fontes auxiliares, funções ou triggers. O operador deve restringir o DML ao intervalo fornecido, nunca alterar id e usar permissões mínimas. Nomes não qualificados usam search_path local seguro no dataSchema; controle continua totalmente qualificado. Preserve catálogo/destino para execuções recuperáveis; só o texto SQL fica congelado. Compatibilidade TypeScript avançada continua disponível fora do caminho padrão.

## Contrato SQL

- Um UPDATE, INSERT ou DELETE por arquivo UTF-8 estrito, até 1 MiB. Ponto e vírgula final e comentários são permitidos. `operation` é opcional; quando declarada, deve coincidir com o SQL.
- `:inicio` e `:fim` são valores obrigatórios fora de strings/comentários. Escreva o predicado correto `id > :inicio AND id <= :fim`; o scanner não comprova sua semântica. Casts `::TEXT`, aspas, E-strings, dollar strings e comentários aninhados são reconhecidos.
- UPDATE/DELETE escrevem em `table`. INSERT declara `targetTable`; H/cursor/fronteira continuam baseados em `table`, a origem. DELETE calcula a fronteira antes de remover as linhas.
- Exemplo de INSERT: `INSERT INTO destination (id, label) SELECT id, label FROM source WHERE id > :inicio AND id <= :fim;`, com `{"sqlFile":"./jobs/copy.sql","table":"source","targetTable":"destination","operation":"INSERT"}` no catálogo.
- Nomes simples ou qualificados pelo dataSchema confirmado. A transação usa search_path local `pg_catalog, dataSchema`; controle sempre qualificado. Identificadores canônicos minúsculos ASCII, até 63 bytes; IDs positivos, únicos, int/int8 NOT NULL até BIGINT assinado. H e cursor são strings.
- Rejeitados: múltiplos statements, transações/DDL, WITH, MERGE, RETURNING, ON CONFLICT DO UPDATE, parâmetros desconhecidos, bindings de identificadores e `?`/`$1` no código. Uma barra invertida imediatamente seguida de `?` é recusada inclusive em literais/comentários, por limitação do binder Knex; outros `?` nesses trechos são preservados.
- Limites de configuração: batch-size até 2147483646, throttle até 2147483647 ms. São limites técnicos, não recomendações de carga.
- A API TypeScript avançada permanece compatível em `src/core/TransactionalBatchJob.ts`; nenhum job TS experimental integra a entrega. Código personalizado não tem snapshot e deve ser preservado durante recuperação.

## Estrutura da entrega

```text
src/                 CLI pública, executor, persistência e migrations internas
jobs/                SQLs cadastráveis pelo operador
examples/sql/        sementes sintéticas opcionais
tests/               regressões e helpers isolados
observability/       monitoramento opcional (não requerido pela CLI)
README.md            guia principal e contrato SQL
batcheman.config.example.json
package.json / package-lock.json / tsconfig.json
```

`dist/` é gerado por build limpo; `node_modules/` contém dependências locais. `.env` e configurações locais privadas não fazem parte da entrega versionada. O laboratório, resultados, planos e documentação histórica foram preservados **fora deste repositório**, não escondidos numa nova pasta interna. A observabilidade ficou no caminho original porque há serviços com bind mounts ativos; a limpeza não reinicia nem remove esses serviços/volumes.

## Verificação

```bash
npm run build
npm test
npm run db:check
npm run test:integration
```

Integrações só executam no banco **tcc_framework_test**, usando schemas sintéticos próprios e limpeza restrita; db:check usa a configuração de desenvolvimento/fixtures (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`), não a config pública. O loader existente pode carregar `.env` local apenas nesse caminho de desenvolvimento; nunca o redirecione para origem/backup. Guards de contexto explícito, posse e limites de fixtures continuam ativos. Testes dos comandos históricos foram preservados externamente e não entram na suíte desta entrega. Grafana/Docker não são pré-requisitos do framework.

Manifest continua `private: true`, declaração ISC preservada; não houve decisão de nova licença, publicação npm, release ou benchmark.
