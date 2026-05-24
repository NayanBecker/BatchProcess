# Sistema de Processamento em Lote - Documentação

## 📋 Visão Geral (rotina atualizada)

Este documento descreve a rotina atual da aplicação após a introdução do modo "local-first" para execução de jobs. A CLI agora pode operar em dois modos:

- **Modo local (padrão)**: quando a variável de ambiente `API_URL` não está definida, a CLI carrega as definições de jobs em `src/jobs`, registra-as no `JobRegistry` e executa os jobs localmente usando o `JobManager` e o `BatchExecutor` (conexão direta com o banco).
- **Modo API (remoto)**: quando `API_URL` está definida, a CLI age como cliente da API remota e usa os endpoints da API para criar/pausar/retomar jobs.

Esta versão consolidou a execução local como comportamento padrão e remove dependências de invocação por `child_process` entre componentes que eram usadas anteriormente.

---

## ✅ Principais mudanças na rotina

- CLI local-first: `npm run dev start <JobName>` cria e despacha jobs diretamente no banco e dispara o `JobManager` local se necessário.
- Auto-descoberta de jobs: qualquer classe exportada em `src/jobs/*.ts` que estenda `BatchJob` será carregada e registrada automaticamente.
- Persistência e observabilidade: o estado do job, logs e erros continuam persistidos nas tabelas `batch_jobs`, `batch_job_logs` e (quando implementada) `batch_job_errors`.

---

## Como funciona (fluxo resumido)

1. Usuário executa: `npm run dev start NormalizeUserEmailsJob` (modo local por padrão).
2. A CLI carrega `src/jobs/*`, registra as classes no `JobRegistry` e cria um registro em `batch_jobs` com `status = 'pending'`.
3. O `JobManager` (instância singleton) entra em modo de polling e tenta adquirir jobs `pending` para marcar como `running` e despachar para o `BatchExecutor`.
4. O `BatchExecutor` usa `BatchIterator` para buscar lotes e chama `processItem()` da definição do job para cada registro.
5. Progresso, métricas e timestamps são atualizados em `batch_jobs`. Eventos e logs ficam em `batch_job_logs`.

---

## Comandos CLI

- Iniciar novo job (local):

  `npm run dev start <JobName>`

- Pausar job em execução (local/API):

  `npm run dev pause <job_id>`

- Retomar job pausado (local/API):

  `npm run dev resume <job_id>`

- Listar jobs disponíveis (definições carregadas em `src/jobs`):

  `npm run dev jobs`

- Ver status de um job específico (local):

  `npm run dev status <job_id>`

Nota: quando `API_URL` estiver presente, a CLI usará a API em vez de operar diretamente no banco.

---

## Onde colocar/como criar um job

1. Crie uma nova classe em `src/jobs/` que estenda `BatchJob`:

```typescript
import { BatchJob } from '../core/BatchJob';

export class MyNewJob extends BatchJob<any> {
  tableName = 'minha_tabela';

  async processItem(record: any): Promise<void> {
    // lógica específica por registro
  }
}
```

2. Salve o arquivo em `src/jobs/MyNewJob.ts`. A CLI irá carregá-lo automaticamente na próxima execução.

Requisitos:
- A classe deve ser exportada com `export class <Name> extends BatchJob`.
- `tableName` deve apontar para a tabela de origem usada pelo job.

---

## Banco de dados e migrations

- Arquivos de migração: `src/db/migrations/*` (ex.: `001_create_batch_jobs.ts`, `002_create_users.ts`).
- Rodar migrations antes de executar jobs:

```bash
npx knex migrate:latest
```

- A conexão com o banco está em [src/db/conection.ts](src/db/conection.ts). Por enquanto o projeto usa a configuração definida nesse arquivo; recomenda-se parametrizar com variáveis de ambiente em `conection.ts` se for necessário para o seu ambiente.

Tabelas principais:
- `batch_jobs` — fila/estado dos jobs (id, job_name, status, batch_size, current_id, processed_rows, throttle_ms, timestamps).
- `batch_job_logs` — logs de execução por job/lote.
- `batch_job_errors` — (recomendado/pendente) para registrar exceções e permitir retries.

---

## Configuração e variáveis relevantes

- `API_URL` — se definida, a CLI funciona contra a API remota (modo cliente); caso contrário, entra em modo local.
- `MAX_CONCURRENT` — controla quantos jobs o `JobManager` pode executar em paralelo (o código usa `process.env.MAX_CONCURRENT || 1`).

Recomendações:
- Defina variáveis de ambiente para o seu ambiente (ou modifique `src/db/conection.ts`).

---

## Ciclo de vida do job (detalhes operacionais)

- Estados: `pending` → `running` → `paused` → `completed`.
- Ao criar um job (`start`), a CLI insere um registro em `batch_jobs` com `status = 'pending'` e o `JobManager` se encarrega de adquirir e executar.
- O `BatchExecutor` grava progresso (`current_id`, `processed_rows`) e atualiza `status` quando finaliza.

---

## Observabilidade e logs

- Logs por job: gravados em `batch_job_logs` (cada evento/erro deve ser persistido lá).
- Métricas runtime (throughput, avg item duration) são calculadas pelo `JobManager` e exibidas via `npm run dev status <id>`.

---

## Diferenças em relação à documentação anterior

- Removido: a dependência de que a API sempre invocava a CLI via `child_process` para iniciar jobs.
- Agora: execução local é suportada nativamente pela CLI; a API (se existir) permanece como opção de orquestração remota, mas não é obrigatória.

---

## Boas práticas e próximos passos recomendados

1. Parametrizar `src/db/conection.ts` com variáveis de ambiente para facilitar deploys.
2. Implementar tabela `batch_job_errors` e estratégia de retry/backoff para falhas em `processItem()`.
3. Adotar lock/forUpdate (`SELECT ... FOR UPDATE SKIP LOCKED`) ao adquirir jobs em cenários com múltiplos executores (ver Item D no plano).
4. Adicionar monitoramento (Prometheus/Grafana já disponível no repositório) para acompanhar throughput e saúde do DB.

---

## Comandos úteis — resumo rápido

```bash
# Instalar dependências
npm install

# Rodar migrations
npx knex migrate:latest

# Iniciar job localmente (modo padrão)
npm run dev start NormalizeUserEmailsJob

# Pausar / retomar
npm run dev pause <job_id>
npm run dev resume <job_id>

# Listar jobs definidos
npm run dev jobs

# Ver status de um job
npm run dev status <job_id>
```

---

## Arquivos importantes

- Job definitions: [src/jobs](src/jobs)
- CLI entrypoint: [src/cli/index.ts](src/cli/index.ts)
- Core: [src/core/BatchJob.ts](src/core/BatchJob.ts), [src/core/BatchIterator.ts](src/core/BatchIterator.ts), [src/core/BatchExecutor.ts](src/core/BatchExecutor.ts), [src/core/JobRegistry.ts](src/core/JobRegistry.ts), [src/core/JobManager.ts](src/core/JobManager.ts)
- DB connection: [src/db/conection.ts](src/db/conection.ts)
- Migrations: [src/db/migrations](src/db/migrations)

---

Se quiser, posso:
- converter `src/db/conection.ts` para usar variáveis de ambiente;
- adicionar seção curta no `Readme.md` com exemplos mínimos de uso;
- implementar a tabela `batch_job_errors` e o registro automático de exceções.

Autor: nayanbecker
Data: 2026-04-10