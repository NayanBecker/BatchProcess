# Framework de processamento em lote — TCC II

**Comece por [STATUS-TCC.md](STATUS-TCC.md): resumo do que foi feito e do que falta.**

- [Fase B — protocolo atual](docs/experiments/protocol.md): dez operações nas tabelas auxiliares de `postgres.public`.
- [SQL das operações, ainda não executado](experiments/operations/README.md).
- `tcc_framework_test` permanece para desenvolvimento/testes internos. O fluxo abaixo é da Fase A, não executa benchmarks em `postgres`.

Protótipo de Nayan Tobias Becker. Esta base dá continuidade ao TCC I; a **Fase A prepara e valida a instalação**, não comprova desempenho nem confiabilidade do processamento massivo.

- [Preparação reproduzível e cuidados com o banco](docs/PREPARACAO-FASE-A.md)
- [Inventário do ambiente observado](docs/AMBIENTE-FASE-A.md)
- [Registro das validações](docs/VALIDACAO-FASE-A.md)
- [Exemplos históricos, desativados](examples/legacy/README.md)

## Fluxo rápido

Requer Node.js >=22.22.2, npm e PostgreSQL disponível. Primeiro siga o guia para criar/configurar **exclusivamente `tcc_framework_test`** e preencher o `.env` local (nunca versionado).

```bash
npm ci
npm run build
npm test
npm run db:check
npm run migrate
npm run test:integration
npm run dev -- jobs
npm start -- list
```

Na Fase A, o catálogo de jobs e a tabela de execuções devem estar vazios. Novos jobs serão criados depois dos ajustes funcionais. Não execute os exemplos antigos para tentar preencher a listagem.

**Atenção:** `npm run migrate:rollback -- --confirm=tcc_framework_test` remove as tabelas/dados do último lote de migrations do banco de testes. Não é um comando de consulta. O guia explica o ciclo de validação e a incompatibilidade com o histórico antigo de `users`.

A documentação antiga `# Sistema de Processamento em Lote - Doc.md` permanece como referência histórica. Para preparar esta versão, use o guia da Fase A. Retomada, checkpoints, retries, timeout, concorrência e experimentos ainda precisam de validação própria.
