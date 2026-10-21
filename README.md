# BatCheman

Protótipo Node.js/TypeScript para executar DML no PostgreSQL em uma transação **monolítica** ou em **lotes com checkpoint durável**. Uso pelo repositório; não é pacote npm publicado nem fila distribuída. Originado em TCC, sem promessa de desempenho ou prontidão para dados críticos.

## 1. Clonar, instalar e compilar

Clone **este repositório** pela URL mostrada no botão Clone do seu Git e entre na pasta clonada. Requer Node.js >=22.22.2, npm e PostgreSQL acessível.

```bash
npm ci
npm run build
npm start -- --help
```

## 2. Escrever um arquivo SQL

Não precisa escrever uma classe TypeScript. O catálogo padrão aponta para `jobs/normalize-label.sql` e `jobs/converter-cnpj.sql`. Um arquivo contém **um UPDATE, INSERT ou DELETE**, com os valores obrigatórios `:inicio` e `:fim`:

```sql
UPDATE teste_cnpj
SET cnpj_novo = LPAD(cnpj_antigo::TEXT, 14, '0')
WHERE cnpj_novo IS NULL AND cnpj_antigo IS NOT NULL
  AND id > :inicio AND id <= :fim;
```

Declare no JSON: `"converter-cnpj": {"sqlFile":"./jobs/converter-cnpj.sql", "table":"teste_cnpj", "operation":"UPDATE"}`. Caminhos SQL são relativos **ao arquivo de configuração**, tanto em dev como em dist. `table` é a tabela paginada por `id`; para INSERT, declare também `targetTable` como destino. [Contrato e limites](src/jobs/README.md).

## 3. Configurar um banco descartável e instalar o controle

Crie previamente um banco e usuário PostgreSQL próprios/descartáveis; não use banco de origem, backup principal nem servidor crítico. Copie o exemplo:

```bash
cp batcheman.config.example.json batcheman.config.local.json
```

Edite **somente o arquivo local**: host, port, user e database da conexão; repita o banco em `target.database` como confirmação explícita; escolha dataSchema e um controlSchema privado, distinto e ainda inexistente. O exemplo usa `public.demo_items` como tabela de domínio declarada no job. `public` nunca pode ser schema de controle.

Defina `BATCHEMAN_DB_PASSWORD` no ambiente do terminal (ou o nome definido em passwordEnv); não coloque senha em JSON, comandos versionados nem chat. A CLI pública **não lê .env**, não troca a configuração de testes e não imprime conexão/SQL em erros. O arquivo local é ignorado pelo Git.

```bash
npm start -- jobs list
npm start -- init
```

`jobs list` lê apenas o catálogo, sem conectar. `init` confirma o banco real na conexão e cria **somente** `batch_jobs`, `batch_job_errors`, `batch_job_logs` (estrutura 001–005) num schema dedicado com marcador de posse. É idempotente no controle compatível do usuário atual; recusa schemas preexistentes sem posse/incompatíveis. Não faz DROP, não instala tabelas de domínio e não executa migrations em public.

## 4. Preparar a tabela de domínio e cadastrar

Prepare sua tabela externamente. Opcional: o arquivo **sintético e separado** abaixo cria seis linhas e falha se a tabela já existir. Confira explicitamente o destino da conexão antes de executá-lo (o cadastro não cria tabela):

```bash
psql "$YOUR_DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f examples/sql/create-table-and-seed.sql
npm start -- register normalize-label --mode batch --batch-size 2 --throttle 0
```

`register` retorna JSON com **id**, status `pending`, `highWater`, `sqlHash`, destino e configuração persistidos; não altera os dados de domínio. Salva o texto SQL UTF-8 e seu SHA-256 no estado JSONB existente, sem migration nova. **run/resume/recover executam a versão cadastrada**, mesmo se o arquivo for editado ou removido. Para executar uma edição, faça novo cadastro. Não coloque dados pessoais/literais sensíveis no SQL: o snapshot é durável, embora status/logs/errors não imprimam o texto SQL.

H limita a execução aos IDs até o cadastro; não é snapshot do conteúdo das linhas. A tabela deve ter `id` inteiro/BIGINT, positivo, único, NOT NULL e estável. Para experimentar CNPJ com cinco registros artificiais, use separadamente `examples/sql/create-cnpj-synthetic.sql` e depois `npm start -- register converter-cnpj --mode batch --batch-size 2`; o resultado inicial é visited 5, changed 3, commits 3. Não execute esse seed em tabela pessoal/existente.

## 5. Executar e acompanhar

Substitua `ID` pelo número retornado; não digite literalmente ID:

```bash
npm start -- run ID
npm start -- status ID
npm start -- logs ID
npm start -- errors ID
```

Esperado no exemplo: `completed`, `visited: "6"`, `changed: "5"`, `commits: "3"`. NULL permanece NULL. Status/logs são estado operacional, não certificação de integridade dos dados. Logs/errors retornam os 200 registros mais recentes, ordem decrescente de id.

Para uma **nova execução monolítica**, use outro cadastro:

```bash
npm start -- register normalize-label --mode monolithic
npm start -- run ID
```

`register` aceita `--mode monolithic|batch`, `--batch-size` (default 1000) e `--throttle` em ms (default 0). Sem modo, usa batch. **Modo e opções ficam imutáveis naquele id**, inclusive após progresso/retomada; `run` não aceita alterações. Exemplo já normalizado pode mudar zero linhas; use conjuntos iniciais independentes para comparar modos, nunca reset automático.

Todos os comandos aceitam `--config caminho.json` para escolher outro arquivo explicitamente. Desenvolvimento usa os mesmos argumentos com `npm run dev -- ...`; após editar TS, recompile antes de usar npm start.

### Pausa, retomada e falha

Em outro terminal: `npm start -- pause ID` ou `cancel ID` solicita parada de um job **running** na próxima fronteira transacional. Não interrompe DML em andamento nem desfaz lotes já confirmados. `resume ID` apenas reenfileira um job **paused**; depois execute `run ID`. Após crash/falha, `recover ID` exige posse livre e protocolo comprovado e reenfileira explicitamente; confira status/errors e o destino antes de executar novamente. Ctrl+C pede pausa cooperativa; uma transação longa pode demorar para responder.

Monolithic usa um commit de domínio; batch permite commits parciais. DML e checkpoint usam a mesma transação/conexão com posse de sessão. Não há retry automático, restauração, validação genérica de resultados, DDL em lotes ou garantia exactly-once para efeitos externos. SQL é de autoria **confiável do operador**, não sandbox. A validação lexical rejeita múltiplos statements, comandos transacionais/DDL, WITH e RETURNING; não prova a semântica do WHERE, fontes auxiliares, funções ou triggers. O operador deve restringir o DML ao intervalo fornecido, nunca alterar id e usar permissões mínimas. Nomes não qualificados usam search_path local seguro no dataSchema; controle continua totalmente qualificado. Preserve catálogo/destino para execuções recuperáveis; só o texto SQL fica congelado. Compatibilidade TypeScript avançada continua disponível fora do caminho padrão.

## Verificação e pesquisa (opcionais)

```bash
npm run build
npm test
npm run db:check
npm run test:integration
```

Integrações só executam no banco **tcc_framework_test**, usando schemas sintéticos próprios e limpeza restrita; db:check usa a configuração histórica de fixtures, não a config pública. Nunca a redirecione para origem/backup. [Histórico A–E, protocolo, laboratório e observabilidade opcionais](research/README.md). Grafana/Docker não são pré-requisitos do framework.

Manifest continua `private: true`, declaração ISC preservada; não houve decisão de nova licença, publicação npm, release ou benchmark.
