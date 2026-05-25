# Sistema de Processamento em Lote - Documentacao (CLI)

## Visao geral

Sistema de processamento em lote desenvolvido em TypeScript com Knex.js e PostgreSQL, operado apenas via CLI. A execucao e local, com acesso direto ao banco e orquestracao pelo JobManager e BatchExecutor.

## Como executar

Pre-requisitos: Node.js 18+ e PostgreSQL acessivel pela configuracao em `src/db/conection.ts`.

```bash
npm install
npx knex migrate:latest
```

### Comandos CLI

```bash
# Iniciar job
npm run dev start <JobName>

# Pausar / retomar
npm run dev pause <job_id>
npm run dev resume <job_id>

# Listar jobs
npm run dev list

# Ver status e logs
npm run dev status <job_id>
npm run dev logs <job_id>

# Listar jobs disponiveis no registry
npm run dev jobs
```

## Fluxo de execucao (resumo)

1. A CLI carrega definicoes em `src/jobs` e registra as classes no `JobRegistry`.
2. `start` cria um registro em `batch_jobs` (status `pending`).
3. O `JobManager` inicia polling e despacha para o `BatchExecutor`.
4. O `BatchExecutor` processa lotes com `BatchIterator`, atualizando progresso no banco.

## Estrutura principal

```
src/
  cli/index.ts        # Entrada da CLI
  core/               # BatchJob, BatchIterator, BatchExecutor, JobRegistry, JobManager
  jobs/               # Definicoes de jobs
  db/                 # Conexao e migrations
```

## Criar um novo job

Crie uma classe em `src/jobs/` que estenda `BatchJob`:

```typescript
import { BatchJob } from '../core/BatchJob';

export class MyNewJob extends BatchJob<any> {
  tableName = 'minha_tabela';

  async processItem(record: any): Promise<void> {
    // logica de processamento por registro
  }
}
```

Salve em `src/jobs/MyNewJob.ts`. A CLI carrega automaticamente na proxima execucao.

## Banco de dados

Migrations em `src/db/migrations` (ex.: `001_create_batch_jobs.ts`, `002_create_users.ts`).

Tabelas principais:
- `batch_jobs` — fila/estado dos jobs
- `batch_job_logs` — logs de execucao por job
- `batch_job_errors` — erros (quando implementado)

## Configuracao

- `MAX_CONCURRENT` controla quantos jobs podem rodar em paralelo.
- A conexao com o banco esta em `src/db/conection.ts`.

## Observabilidade

Os eventos e logs do job ficam em `batch_job_logs`. Os comandos `status` e `logs` consultam essas informacoes via `JobManager`.

## Proximos passos recomendados

1. Melhorar controle de concorrencia ao adquirir jobs (`SELECT ... FOR UPDATE`).
2. Implementar retry/backoff e persistencia de erros em `batch_job_errors`.
3. Parametrizar `src/db/conection.ts` com variaveis de ambiente.
