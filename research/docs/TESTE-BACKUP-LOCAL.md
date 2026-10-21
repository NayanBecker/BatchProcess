> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Backup local — superfície atual reduzida

`validate` (comparação de resultados/dados) e `restore` foram retirados da CLI, API de review e wrapper. Não há ferramenta externa executável substituta. Os trechos antigos estão arquivados em [archive/result-tools](../../archive/result-tools/README.md), fora de src/build. O [relato anterior](../../archive/result-tools/TESTE-BACKUP-LOCAL.historical.md) é histórico superado, não roteiro executável atual.

Dados, snapshots, checkpoints e histórico existentes foram preservados. Esta alteração não consultou nem modificou backup_testes/postgres e não repetiu os testes reais antigos. Não execute reset para retomar trabalho.

## Inspeção operacional disponível

Após build, o wrapper continua oferecendo check-config/check/prepare/mark/run/status/list e prepare-data; prepare-data é preparação explícita, não reset. Os últimos comandos podem escrever: **não os execute sobre dados existentes sem autorização e revisão do estado**.

```bash
npm run build
node scripts/backup-review.cjs check-config
node scripts/backup-review.cjs list EXP-06
# Substitua ID pelo ID existente; B apenas ocupa a posição do argumento modo.
node scripts/backup-review.cjs status EXP-06 B ID
```

Destino fixo do wrapper: backup_testes/review_data/benchmark_control, opt-in/allowlist/identidade e limite de 1000 linhas mantidos. Não mudar .env nem expor senha. Datasets já preparados não são sobrescritos; não há repetição A/B automática sobre o mesmo estado final. Novas rodadas exigem conjuntos iniciais isolados, preparados pelo operador fora da aplicação, preservando histórico existente.

**Estado de execução não é certificado de dados.** status/completed/failed, error_count, logs/errors, falhas SQL/checkpoint, rollback e recovery continuam no framework. `completed` informa conclusão operacional; não afirma igualdade de conjuntos nem integridade de dados de domínio. As comparações independentes permanecem nas suítes sintéticas, por SQL/assertions de teste.

## Regressão segura desta retirada

```bash
npm run build
npm test
npm run db:check
npm run test:integration
```

Integração somente em tcc_framework_test e schemas próprios com cleanup. Sem benchmark, operação no backup ou certificação de backup nesta entrega.
