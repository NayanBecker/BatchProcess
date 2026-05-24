# ✅ Backstage Integration - Implementation Summary

## 🎯 O que foi Implementado

Plugin **Backstage** completo para monitoramento de jobs de processamento em lote, operando **diretamente sobre o PostgreSQL** sem necessidade de API intermediária.

## 📦 Estrutura Criada

### 1. Plugin Customizado: `@backstage/plugin-batch-monitor`

**Localização**: `backstage/packages/plugin-batch-monitor/`

**Componentes**:
- `backend.ts` - API Express (mountPath: `/api/batch`)
- `src/types.ts` - Interfaces TypeScript
- `src/services/batchService.ts` - DatabaseAdapter (conexão direta ao PostgreSQL)
- `src/components/`:
  - `JobList.tsx` - Lista interativa de jobs
  - `JobDetail.tsx` - Painel de detalhes com erros
  - `JobMetrics.tsx` - Cards de métricas
- `src/routes/BatchPage.tsx` - Página principal (`/batch`)
- `src/index.ts` - Definição do plugin

### 2. Aplicação Backstage

**Localização**: `backstage/app/`

**Estrutura**:
- Aplicação completa com plugins padrão (Catalog, Scaffolder, TechDocs, etc.)
- Plugin batch-monitor integrado
- Configuração para montar rotas em `/api/batch`

## 🔌 Arquitetura Universal (Adapter Pattern)

```typescript
interface IBatchAdapter {
  getJobs(): Promise<BatchJob[]>;
  getJobById(id: number): Promise<BatchJob | null>;
  pauseJob(id: number): Promise<void>;
  resumeJob(id: number): Promise<void>;
  getJobErrors(jobId: number): Promise<BatchJobError[]>;
  getMetrics(): Promise<JobMetrics>;
}
```

**Implementação atual**: `DatabaseAdapter` (conecta diretamente ao PostgreSQL)
**Futuro**: Pode ser substituído por `RestApiAdapter`, `CliAdapter`, etc. **sem alterar a UI**.

## 🌐 Endpoints da API do Plugin

O backend do plugin cria automaticamente as seguintes rotas:

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/batch/jobs` | Lista todos os jobs |
| `GET` | `/api/batch/jobs/:id` | Detalhes de um job |
| `POST` | `/api/batch/jobs/:id/pause` | Pausa execução |
| `POST` | `/api/batch/jobs/:id/resume` | Retoma execução |
| `DELETE` | `/api/batch/jobs/:id` | Remove job (não execução) |
| `GET` | `/api/batch/jobs/:id/errors` | Erros recentes do job |
| `GET` | `/api/batch/metrics` | Métricas do sistema |
| `GET` | `/api/batch/health` | Health check |

Esses endpoints são consumidos pelos componentes React automaticamente.

## 🚀 Como Rodar

### 1. Instalar Dependências

```bash
npm run backstage:install
```

### 2. Build do Plugin

```bash
npm run backstage:build
```

### 3. Configurar Banco

Crie `backstage/.env`:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=sua_senha
DATABASE_NAME=batch_db
```

### 4. Iniciar

```bash
npm run backstage:start
```

Acesse: http://localhost:3000/batch

## 📋 Pré-requisitos do Banco de Dados

O plugin acessa as tabelas existentes do seu sistema:
- `batch_jobs` - Jobs e status
- `batch_job_errors` - Registro de erros (opcional)

Execute as migrations caso ainda não existam:

```bash
npm run migrate
```

## 🎨 Funcionalidades da UI

**Dashboard** (`/batch`):
- **Métricas**: total, rodando, pendentes, pausados, concluídos
- **Lista de Jobs**: status, progresso, taxa de processamento, ações
- **Detalhes**: clique em um job para ver erros, informações, controles
- **Atualização**: botão para recarregar dados

**Controles por Job**:
- ▶️ Iniciar/Retomar
- ⏸️ Pausar
- 🗑️ Excluir (apenas se não estiver rodando)

## 🔄 Workflow Universal

```
┌─────────────────┐
│    Backstage    │
│    (Frontend)   │
│   /batch page   │
└────────┬────────┘
         │ fetch('/api/batch/...')
         ▼
┌─────────────────┐
│ Plugin Backend  │
│  (Express)      │
│  /api/batch/*   │
└────────┬────────┘
         │ DatabaseAdapter
         ▼
┌─────────────────┐
│  PostgreSQL     │
│ batch_jobs      │
└─────────────────┘
```

## 📁 Arquivos Principais

| Arquivo | Descrição |
|---------|-----------|
| `backstage/app/src/index.ts` | Ponto de entrada da aplicação Backstage |
| `backstage/app/app-config.yaml` | Configurações (mountPath, plugins) |
| `backstage/packages/plugin-batch-monitor/backend.ts` | API REST do plugin |
| `backstage/packages/plugin-batch-monitor/src/components/` | Componentes React |
| `backstage/packages/plugin-batch-monitor/src/services/batchService.ts` | DatabaseAdapter |
| `backstage/packages/plugin-batch-monitor/src/types.ts` | Tipos TypeScript |

## 🔧 Customização

### Alterar tema/estilos

Edite os componentes em `src/components/` ou sobrescreva com Material-UI theme.

### Adicionar nova fonte de dados

Crie novo adapter implementando `IBatchAdapter`:

```typescript
export class RestApiAdapter implements IBatchAdapter {
  constructor(private baseUrl: string) {}
  async getJobs() {
    const res = await fetch(`${this.baseUrl}/jobs`);
    return res.json();
  }
  // ... outros métodos
}
```

Configure em `app-config.yaml`:

```yaml
batchMonitor:
  adapter: rest
  api:
    baseUrl: http://sua-api:3000
```

### Adicionar novas páginas

Crie novo componente React e adicione rota no plugin `src/index.ts`.

## 🏗️ Build de Produção

```bash
cd backstage/app
npm run build    # Gera .dist/
npm run export   # Gera site estático em .export/
```

Sirva a pasta `dist/` com Nginx, Apache, ou qualquer servidor estático.

## 📚 Documentação

- `backstage/README.md` - Guia completo
- `backstage/SETUP.md` - Instalação passo a passo
- `backstage/QUICKSTART.md` - Início rápido (3 passos)
- `backstage/packages/plugin-batch-monitor/ARCHITECTURE.md` - Arquitetura técnica
- `backstage/MAIN.md` - Navegação do projeto Backstage
- `DOCUMENTATION.md` - Sistema de batch original

## 🎉 Resultado

✅ Plugin Backstage funcional
✅ Conexão direta ao PostgreSQL (sem API extra)
✅ UI completa de monitoramento
✅ Controles de pause/resume/delete
✅ Métricas em tempo real
✅ Arquitetura universal (adapter pattern)
✅ Facilmente extensível para outras fontes de dados

**Pronto para usar em produção com segurança e escalabilidade!**
