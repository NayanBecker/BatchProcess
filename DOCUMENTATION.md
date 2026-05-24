# Sistema de Processamento em Lote - Documentação

## 📋 Visão Geral

Documentação completa do sistema de processamento em lote (batch processing) desenvolvido em TypeScript com Knex.js e PostgreSQL.

---

## 📋 Visão Geral (rotina atualizada)

Este documento descreve a rotina atual da aplicação após a introdução do modo "local-first" para execução de jobs. A CLI agora pode operar em dois modos:

- **Modo local (padrão)**: quando a variável de ambiente `API_URL` não está definida, a CLI carrega as definições de jobs em `src/jobs`, registra-as no `JobRegistry` e executa os jobs localmente usando o `JobManager` e o `BatchExecutor` (conexão direta com o banco).
- **Modo API (remoto)**: quando `API_URL` está definida, a CLI age como cliente da API remota e usa os endpoints da API para criar/pausar/retomar jobs.

Esta versão consolidou a execução local como comportamento padrão e remove dependências de invocação por `child_process` entre componentes que eram usadas anteriormente.

---


## ✅ Objetivos Alcançados (Itens A-C)

### **Item A: Arquitetura Assíncrona e Incremental**

**Status:** ✅ Implementado

**O que foi feito:**
- Sistema desenvolvido em TypeScript com suporte nativo a async/await
- Processamento não-bloqueante usando Promises
- Execução incrementar por meio de batches (lotes) com tracking de progresso

**Componentes principais:**
- `BatchExecutor`: Orquestrador assíncrono (src/core/BatchExecutor.ts)
- `BatchIterator`: Divisor de dados em lotes (src/core/BatchIterator.ts)
- `BatchJob`: Classe base abstrata para definição de jobs (src/core/BatchJob.ts)

**Exemplo de uso assíncrono:**
```typescript
while (true) {
    const records = await iterator.fetchBatch();
    if (records.length === 0) break;
    
    for (const record of records) {
        await jobDef.processItem(record); // Processamento incremental
    }
}
```

---

### **Item B: Mecanismo de Filas (Queue)**

**Status:** ✅ Implementado

**O que foi feito:**
- Implementado usando tabela `batch_jobs` no PostgreSQL como fila persistente
- Desacoplamento completo entre trigger (CLI) e executor
- Sistema de status com states bem definidos

**Tabela `batch_jobs` (migration 001):**
```sql
- id: inteiro (PK)
- job_name: nome do job a executar
- status: 'pending' | 'running' | 'paused' | 'completed'
- batch_size: tamanho do lote (padrão: 1000)
- current_id: último ID processado
- processed_rows: contador de registros processados
- throttle_ms: delay entre lotes (padrão: 500ms)
- created_at, updated_at: timestamps
```

**Comandos da CLI (src/cli/index.ts):**

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

### **Item C: Protótipo de Sistema de Batch**

**Status:** ✅ Implementado

**O que foi feito:**
- Framework genérico para processamento em lotes
- Job concreto de exemplo: `NormalizeUserEmailsJob`
- Divisão automática por ID crescente

**Arquitetura do Framework:**

1. **BatchJob<T>** (classe abstrata base)
   - `tableName`: tabela de origem dos dados
   - `processItem(record)`: método abstrato - lógica específica do job
   - `queryBuilder(lastId, batchSize)`: query SQL para buscar próximo lote

2. **BatchIterator<T>**
   - Recebe um jobRow (estado atual) e jobDef (definição)
   - `fetchBatch()`: executa query e retorna array de registros

3. **BatchExecutor<T>**
   - Loop principal de execução
   - Atualiza status na tabela (running → completed)
   - Controla throttle (delay entre lotes)
   - Persiste progresso (current_id, processed_rows)

**Job de Exemplo - NormalizeUserEmailsJob:**
```typescript
export class NormalizeUserEmailsJob extends BatchJob<any> {
    tableName = 'users';

    async processItem(user: any): Promise<void> {
        if (!user.email) return;
        
        await db('users')
            .where({ id: user.id })
            .update({
                normalized_email: user.email.trim().toUpperCase(),
                update_at: new Date()
            });
    }
}
```

**Job Registry (src/core/JobRegistry.ts):**
- Mapa centralizado de jobs disponíveis
- Fácil extensão: basta adicionar novo job ao registry

**Como executar:**
```bash
npm run dev start NormalizeUserEmailsJob
```

**Banco de dados:**
- Migration 001: cria tabela `batch_jobs`
- Migration 002: cria tabela `users` com campo `normalized_email`

---

## 📊 Estado Atual do Código

### Estrutura de Arquivos:
```
src/
├── cli/
│   └── index.ts              # Interface CLI (start/pause/resume)
├── core/
│   ├── BatchJob.ts          # Classe base abstrata
│   ├── BatchIterator.ts     # Busca de lotes
│   ├── BatchExecutor.ts     # Orquestrador principal
│   └── JobRegistry.ts       # Registro de jobs
├── jobs/
│   └── NormalizeUserEmailsJob.ts  # Job de exemplo
├── db/
│   ├── conection.ts         # Configuração Knex (PostgreSQL)
│   └── migrations/
│       ├── 001_create_batch_jobs.ts
│       └── 002_create_users.ts
```

### Dependências (package.json):
- **knex**: ^3.1.0 (query builder + migrations)
- **pg**: ^8.18.0 (PostgreSQL client)
- **typescript**: ^5.9.3
- **ts-node**: ^10.9.2

---

## 🎯 Próximos Passos (Itens D-G)

### **Item D: Controle de Concorrência**

**Problema atual:**
- Não há mecanismo para múltiplos executores simultâneos
- Risco de lock no banco (mesmo registro processado 2x)
- Sem controle de concorrência

**Solução proposta:**

1. **Lock otimista na tabela batch_jobs:**
```typescript
// Atualizar status usando condição (SELECT FOR UPDATE SKIP LOCKED)
// Marcar job como 'running' somente se estiver 'pending'
```

2. **Distribuição de trabalho por partição:**
- Dividir tabela de dados em ranges de ID
- Cada executor pega um range diferente
- Evita concorrência no processamento

3. **Implementação sugerida:**
```typescript
// Em BatchExecutor.run()
await db.transaction(async trx => {
    const jobRow = await trx('batch_jobs')
        .where({ id: jobId, status: 'pending' })
        .forUpdate()  // lock row
        .first();
    
    if (jobRow) {
        await trx('batch_jobs')
            .where({ id: jobId })
            .update({ status: 'running' });
    }
});
```

---

### **Item E: Monitoramento e Controle**

**Status:** ✅ Implementado

**O que foi feito:**
- API REST completa para consulta e controle de jobs (pasta `api/`)
- Interface web integrada (dashboard)
- Endpoints para listar, pausar, retomar e deletar jobs
- Endpoint de health check
- Integração com CLI: a API invoca os comandos da CLI para iniciar/retomar jobs via `child_process`

**Detalhes da implementação:**

1. **Estrutura da API** (`api/`):
```
api/
├── src/
│   ├── server.ts          # Servidor Express
│   ├── db/conection.ts    # Conexão independente ao PostgreSQL
│   ├── routes/batch.ts    # Rotas da API
│   └── interfaces.ts      # Tipos TypeScript
├── public/
│   └── index.html         # Dashboard web
├── package.json
└── tsconfig.json
```

2. **Endpoints disponíveis:**
   - `GET    /api/batch/jobs` - Lista jobs com paginação
   - `GET    /api/batch/jobs/:id` - Detalhes de job específico
   - `GET    /api/batch/jobs/:id/status` - Status formatado com progresso
   - `POST   /api/batch/jobs/:id/pause` - Pausa execução
   - `POST   /api/batch/jobs/:id/resume` - Retoma execução (spawna CLI resume)
   - `DELETE /api/batch/jobs/:id` - Remove job (se não estiver rodando)
   - `GET    /api/batch/health` - Health check

3. **Dashboard Web:**
   - Visualização responsiva
   - Atualização automática a cada 5 segundos
   - Tabela de jobs com status, contadores
   - Detalhes de progresso com barra de progresso
   - Ações diretas (Pausar, Iniciar/Retomar, Excluir)
   - Referência aos comandos CLI para criação de novos jobs

4. **Integração com CLI:**
   - A API não executaBatchExecutor diretamente
   - Usa `child_process.exec` para despachar comandos CLI (`npm run dev start/resume`)
   - Evita duplicação de código e mantém a lógica de execução centralizada na CLI
   - Resposta imediata ao usuário enquanto o job é executado em background

**Como usar:**
```bash
cd api
npm install
npm run dev   # Roda API em http://localhost:3000
```

No navegador, acesse `http://localhost:3000/` para o dashboard.
Para criar um novo job, use a CLI na raiz:
```bash
npm run dev start NormalizeUserEmailsJob
```
O job aparecerá no dashboard, onde poderá ser controlado.

**Próximos passos dentro do item E:**
- Adicionar tabela `batch_job_errors` e registro de exceções em `processItem()`
- Implementar retry com backoff nas falhas
- Log estruturado em arquivo ou sistema de logs
- Dashboard: exibir histórico e logs de erros
- (Futuro) Integração com Grafana + Prometheus para métricas avançadas

---

### **Item F: Benchmark e Performance**

**Objetivo:**
Comparar性能 entre batch processing vs. processamento monolithic tradicional

**Testes propostos:**

1. **Dataset de teste:**
   - 100k, 500k, 1M registros na tabela `users`
   - Dados sintéticos com Faker.js

2. **Métricas a coletar:**
   - Tempo total de execução
   - Throughput (registros/segundo)
   - Uso de memória (heap size)
   - Estatísticas do banco (locks, deadlocks, queda de performance)
   - Impacto de batch_size (pequeno vs. grande)
   - Impacto de throttle_ms

3. **Cenário de comparação:**
```typescript
// Monolítico (forma tradicional)
async function monolithicProcess() {
    const users = await db('users').select('*');
    for (const user of users) {
        await processUser(user); // Um por um
    }
}

// Batch (nosso sistema)
npm run dev start NormalizeUserEmailsJob
```

4. **Análise de resultados:**
- Gráficos de tempo vs. volume
- Identificação de ponto ótimo de batch_size
- Estudo do impacto do throttle na performance do BD

**Ferramentas:**
- `console.time()` / `console.timeEnd()` para timings
- `process.memoryUsage()` para memória
- `pg_stat_activity` do PostgreSQL para estatísticas

---

### **Item G: Validação Prática**

**Simulação de cenário real:**

1. **Volume de dados grande:**
   - Popular tabela `users` com 1M+ registros
   - Verificar se sistema mantém performance

2. **Teste de recover/failure:**
   - Matar processo durante execução
   - Retomar com `resume` e verificar continuação correta
   - Não reprocessar registros já processados

3. **Teste de pause/resume:**
   - Pausar midway
   - Verificar se `current_id` e `processed_rows` estão corretos
   - Retomar e completar sem issues

4. **Stress test:**
   - Múltiplos jobs simultâneos (se implementar concorrência)
   - Observar degradação de performance do BD

5. **Validação de dados:**
   - Após execução, verificar se TODOS os emails foram normalizados
   - `SELECT COUNT(*) FROM users WHERE normalized_email IS NULL` deve ser 0

---

## 🏗️ Arquitetura Técnica

### Diagrama de Fluxo:

```
┌─────────────┐
│   CLI       │ npm run dev start NormalizeUserEmailsJob
└──────┬──────┘
       │ 1. Cria registro batch_jobs (status=pending)
       ▼
┌─────────────────────┐
│   batch_jobs table  │
│  [id=1, status=...] │
└─────────┬───────────┘
          │
          │ 2. BatchExecutor lê registro e busca lotes
          ▼
    ┌────────────┐
    │ BatchIterator │ fetchBatch() → SELECT * FROM users WHERE id > current_id LIMIT batch_size
    └──────┬───────┘
           │
           │ 3. Para cada registro
           ▼
    ┌─────────────────┐
    │ processItem()   │  lógica específica do job
    │ (jobDef)        │  ex: update normalized_email
    └────────┬────────┘
             │
             │ 4. Atualiza progresso
             ▼
    ┌────────────────────┐
    │ batch_jobs update  │ current_id, processed_rows
    └────────────────────┘
```

### Padrões Utilizados:

1. **Template Method**: `BatchJob` define estrutura, subclasses implementam `processItem()`
2. **Iterator**: `BatchIterator` abstrai busca de lotes
3. **Executor/Worker**: `BatchExecutor` orquestra loop de processamento
4. **Registry Pattern**: `JobRegistry` mapeia nomes → classes

---

## 🔧 Próximos Passos

### Prioridade Alta:
1. **Item D:** Implementar controle de concorrência (SELECT FOR UPDATE) para evitar race conditions.
2. **Item E:** Adicionar error handling no BatchExecutor: capturar exceções em `processItem()`, registrar em `batch_job_errors`, implementar retry com backoff.
3. **Item E:** Aprimorar dashboard para exibir logs de erros e histórico de execuções.

### Prioridade Média:
4. **Item F:** Realizar benchmark comparativo entre execução monolítica e batch.
5. **Item G:** Validar em cenário real com grande volume de dados (1M+ registros).

### Prioridade Baixa / Futuro:
6. Integração com Grafana + Prometheus para monitoramento avançado do banco.
7. Suporte a diferentes fontes de dados (filas RabbitMQ, SQS, etc.).
8. Configuração externa (YAML/JSON) para batch_size, throttle por job.

---

## 🚀 Como Executar

### Pré-requisitos:
- PostgreSQL rodando local (ou modificar `conection.ts`)
- Node.js 18+

### Instalação:
```bash
npm install
```

### Configurar banco:
```bash
npx knex migrate:latest
```

### Executar job:
```bash
npm run dev start NormalizeUserEmailsJob
```

### Comandos úteis:
```bash
# Ver jobs em andamento
SELECT * FROM batch_jobs WHERE status = 'running';

# Pausar job ID 1
npm run dev pause 1

# Retomar job ID 1
npm run dev resume 1
```

### Executar API de Monitoramento:
```bash
cd api
npm install
npm run dev  # Dashboard em http://localhost:3000
```

---

## 📝 Status da Implementação

| Objetivo | Status | Observações |
|----------|--------|-------------|
| A. Arquitetura assíncrona/incremental | ✅ Concluído | Funcionando completamente |
| B. Mecanismo de filas | ✅ Concluído | Usa tabela batch_jobs |
| C. Protótipo de batch processing | ✅ Concluído | Job de exemplo incluso |
| D. Controle de concorrência | ⏳ Pendente | Precisa de locks na tabela |
| E. Monitoramento/controle | ✅ Concluído | API REST + dashboard web |
| H. Monitoramento avançado (Grafana/Prometheus) | ✅ Concluído | Stack completa com alertas |
| F. Benchmark/performance | ⏳ Pendente | Testes a criar |
| G. Validação prática | ⏳ Pendente | Testes de stress a fazer |

---

## 📊 Monitoramento Avançado (Grafana + Prometheus)

O sistema agora inclui uma stack completa de monitoramento com **Prometheus** e **Grafana**, focada em métricas do banco de dados e performance da API.

### ✅ Componentes Implementados

1. **Métricas Prometheus** (já existentes na API)
   - `database_pool_connections`: Conexões ativas/disponíveis/aguardando
   - `database_query_duration_seconds`: Duração das queries (histograma)
   - `database_queries_total`: Total de queries por operação e tabela
   - `database_errors_total`: Erros por tipo de operação e tabela
   - `batch_jobs_active`: Jobs em execução
   - `batch_jobs_by_status`: Jobs por status
   - `http_requests_total`: Requisições HTTP
   - `http_request_duration_seconds`: Latência das requisições
   - `api_uptime_seconds`: Tempo de atividade da API

2. **Rastreamento Automático de Queries**
   - Events do Knex interceptam todas as queries
   - Métricas coletadas em tempo real sem código adicional
   - Detecção automática de operação e tabela

3. **Health Checks**
   - Database: `GET /api/monitor/health/database`
   - API: `GET /api/batch/health`
   - Status geral: `GET /api/monitor/status`
   - Estatísticas do BD: `GET /api/monitor/database/stats`

### 🚀 Como Iniciar

```bash
# 1. Build da API (se não existir)
cd api && npm install && npm run build && cd ..

# 2. Subir stack de monitoramento
docker-compose up -d

# 3. Verificar serviços
docker ps
# Deve mostrar: batch-api (healthy), prometheus, grafana
```

### 🌐 URLs de Acesso

- **API**: http://localhost:3000
- **Dashboard Web**: http://localhost:3000/
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001
  - Usuário: `admin`
  - Senha: `admin`

### 📈 Dashboard do Grafana

O dashboard incluído (`grafana/dashboards/batch-monitoring.json`) contém:

- **Database Pool Connections**: gauge com conexões total/available/waiting
- **Query Rate**: taxa de queries por segundo
- **Query Duration Percentiles**: p50, p95, p99 em segundos
- **Query Errors by Type**: barras horizontais de erros
- **Active Batch Jobs**: número de jobs rodando
- **Batch Jobs by Status**: distribuição por status
- **HTTP Request Rate**: requisições por segundo
- **HTTP Request Duration**: p50, p95, p99
- **API Uptime**: tempo de atividade em segundos
- **Database Health Status**: indicador up/down
- **Query Errors by Table**: tabela comparativa erros vs queries

**Para importar manualmente:**
1. Acesse Grafana (http://localhost:3001)
2. Login: admin/admin
3. Clique em "+" → "Import"
4. Cole o conteúdo de `grafana/dashboards/batch-monitoring.json`
5. Data source: selecione "Prometheus" (http://prometheus:9090)
6. Clique em "Import"

### 🚨 Alertas (Regras Prometheus)

O arquivo `prometheus/alert.rules.yml` define alertas automáticos:

- **DatabaseDown** (critical): API indisponível há >1min
- **HighQueryLatency** (warning): p95 > 5s por 2min
- **HighErrorRate** (warning): taxa de erro > 5% por 3min
- **ConnectionPoolCongested** (warning): >5 conexões esperando por 5min
- **NoActiveJobs** (info): nenhum job ativo por 30min

**Visualização no Grafana:**
- Vá em "Alerting" → "Alert rules"
- Os alertas do Prometheus aparecem automaticamente
- Configure notificações (email, Slack, etc) no Grafana

### 🔧 Configuração Avançada

**Variáveis de ambiente da API (no docker-compose.yml):**
- `DATABASE_HOST`: host do PostgreSQL (padrão: `host.docker.internal` para Windows/Mac)
- `DATABASE_PORT`: porta do BD (padrão: 5432)
- `DATABASE_USER`: usuário
- `DATABASE_PASSWORD`: senha
- `DATABASE_NAME`: nome do banco
- `DB_POOL_MIN` / `DB_POOL_MAX`: tamanho do pool de conexões

**Persistência de dados Docker:**
- `prometheus-data`: séries temporais das métricas
- `grafana-data`: dashboards e configurações

### 📡 Consulta de Métricas

**Ver targets do Prometheus:**
http://localhost:9090/targets

**Testar consulta manual (exemplo):**
```
# Queries por segundo:
rate(database_queries_total[1m])

# Duração p95 das queries:
histogram_quantile(0.95, rate(database_query_duration_seconds_bucket[5m]))

# Conexões no pool:
database_pool_connections
```

---

## 📚 Referências Técnica

- **Knex.js**: Query builder + migrations (https://knexjs.org/)
- **PostgreSQL**: Banco de dados relacional
- **TypeScript**: Tipagem estática
- **Node.js**: Runtime assíncrono

---

**Autor:** nayanbecker  
**Data:** 2025-04-01  
**Versão:** 1.0.0
