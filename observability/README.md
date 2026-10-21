# Observabilidade opcional

Esta pasta não é dependência da CLI. Foi mantida no caminho original para preservar bind mounts de serviços existentes; não mova `grafana/`, `prometheus/` ou configurações enquanto forem consumidas por serviços ativos. A limpeza da entrega não para/reinicia containers nem altera volumes.

O coletor lê o controle durável e expõe estado operacional, não certificação de dados. Métricas usam rótulos limitados; amostras de processo e resolução de scrape não representam CPU SQL nem pico exato. Resultados e configurações locais em `local/` não são artefatos públicos; não versione senhas nem exporte essa pasta como relatório.

Depois de `npm run build`, testes independentes:

```bash
node -r ts-node/register --test --test-concurrency=1 observability/*.test.cjs
```

A fixture exige `tcc_framework_test`, usa sete linhas sintéticas e limpeza com posse. O wrapper existente `node observability/run.cjs ps` consulta o projeto Docker; `collector` é um processo contínuo. `up`/`down` modificam serviços e requerem decisão explícita do operador. O wrapper usa o loader local de desenvolvimento para credenciais, nunca a configuração pública de jobs; não imprima sua configuração/ambiente.

SQL e comandos históricos de pesquisa foram preservados externamente; não são requisitos para executar esses testes ou o coletor.
