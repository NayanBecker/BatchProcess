> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Etapa E — piloto pequeno de carga concorrente

## Resultado atual

Piloto real concluído em `tcc_framework_test`: 18 rodadas de leitura/escrita separadas,
com controle, A e B repetidos três vezes por perfil. **7.200 oferecidas, 7.192 concluídas,
8 descartadas, zero erros/timeouts.** Tabelas e limitações em
[RESULTADOS-PILOTO-E.md](RESULTADOS-PILOTO-E.md).

Isso conclui o procedimento funcional pequeno, **não toda a Etapa E nem a campanha F**.
Não há evidência suficiente para afirmar superioridade do batch.

## Passos para repetir

Na raiz `M:/ProjetoTcc/Processamento_em_loteV5`, banco Docker e stack D disponíveis:

```bash
npm run db:check
npm run build
node research/experiments/phase-e/run.cjs
```

O destino real deve ser `tcc_framework_test`. O final esperado é
`status: completed-small-pilot`, `trials: 18` e `resultDirectory` absoluto.
Não aceita flags para trocar banco/arquivo. Não executa scripts originais nem operações
em `postgres`, `backup_testes`, `public` ou origem. Não remover limites do review.

Antes de iniciar collector, confira se 9464 já responde. Somente se não houver listener,
em outro terminal:

```bash
node observability/start-collector.cjs
```

O piloto usa **9465** e fecha esse servidor ao terminar; alvo de carga down entre
pilotos é esperado. Os quatro alvos permanentes continuam obrigatórios.
Dashboard: <http://127.0.0.1:3000/d/tcc-phase-e>.

O runner usa loader local de credenciais, sobe somente monitoramento, recarrega
Prometheus e confere dashboard, queries e datasource por API. Não imprimir `.env`,
senhas ou DSNs. Se Grafana não recarregar o bind, reiniciar apenas Grafana, nunca o banco.
Há guarda de sessão PostgreSQL: **dois pilotos no mesmo banco não são admitidos**;
um segundo é recusado antes de preparar fixtures. Fechamento da sessão libera a guarda.
Isso não isola o computador de outros programas: não executar testes pesados em paralelo.

## Configuração pequena e explícita

`research/experiments/phase-e/pilot.config.json`:

- 1.000 linhas sintéticas, seed 424242. Fixture nova por rodada; fonte/fingerprint e
  DDL/PK iniciais iguais. ANALYZE e aquecimento iguais. Não garante caches físicos iguais.
- `profiles: [read, write]`: primeiro leitura por PK, depois escrita por PK somente
  `load_counter=load_counter+1`. Não modifica predicado/origem/colunas da transformação.
- Cada perfil: controle/A/B, A/B/controle, B/controle/A. A é uma transação;
  B usa dez lotes de 100, throttle zero. Sem SQL artificial para alongar a manutenção.
- Aquecimento 1 s, janela medida 4 s, 100 chegadas/s (400 requisições/rodada).
  Disparo A/B em aproximadamente 1 s; recuperação restante registrada, não presumida.
- Concorrência 2, fila 8, deadline 500 ms. Pool de carga até 2, cancelamento até 1,
  administrativo até 3, mais uma sessão de guarda. SQL da manutenção: timeout 3000 ms,
  lock timeout 1000 ms. Só schemas aleatórios próprios, limite máximo 1.000 linhas.
- Drain aguarda todas as consultas/cancelamentos antes do cleanup. SIGINT/SIGTERM
  pede parar depois de drenar a rodada corrente, não é interrupção instantânea.

## O que os números significam

**Open loop:** cada chegada tem horário e ID determinados pela seed. Não espera a resposta
anterior para gerar a próxima. Atrasos do gerador permanecem na latência; fila cheia
é descarte explícito. Cada oferecida termina como completed/errors/timeouts/dropped.

- `completed`: resposta dentro do prazo; `errors`: falha sem timeout.
- `timeouts`: prazo esgotado, inclusive em fila; não representa resposta rápida.
- `dropped`: fila cheia, não chegou ao serviço. Missing/censored ficam explícitos.
- Latência: chegada **agendada** até resposta, incluindo gerador/fila/pool.
- Vazão: respostas concluídas / duração incluindo drain, em respostas/s.
- Percentis nearest-rank somente de completed: p50 com n>=20; p95/p99 com n>=100.
  Valor ausente é null, não zero. Mediana de p95 por rodada não é p95 global.

Deadline aciona cancelamento SQL real; `statement_timeout` também limita o servidor.
SQL com `pg_sleep` está apenas no teste de cancelamento, não na transformação.
Cada conexão de carga/cancelamento, guarda e pool administrativo confirma o banco real.

O intervalo **dispatch→retorno** inclui controle/posse/auditoria, não é o cronômetro DML
previsto no protocolo. `workSeconds` exclui checkpoint/commit; round-trip inclui ack e
pode faltar. Não confundir as medidas. CPU/RSS dos eventos compartilham Node com o
gerador; não são recursos isolados do SQL. cAdvisor observa Linux, não o processo Windows.
Exporter PostgreSQL da stack D aponta ao backup histórico, não à fixture do piloto.

## Evidências preservadas

Pasta exclusiva ignorada pelo Git em `experiments/results/`, caminho absoluto no manifesto:

| Arquivo | Conteúdo |
|---|---|
| `manifest.json` | código/checksums, configuração, ordem, versão/runtime, banco e resumo por rodada |
| `trial-{read|write}-*.json` / `.csv` | requisições brutas, horários, latência, outcomes; JSON inclui aquecimento, eventos e integridade |
| `load.prom`, `metrics-catalog.json` | HTTP real, nomes e definições observadas antes de consultar painéis |
| `prometheus-range.json` / `.csv` | séries da janela real, step 1 s |
| `scrape-timestamps.json`, `monitoring-coverage.json` | idade de amostra, cobertura e lacunas sem zero-fill |
| `dashboard-readback.json`, `datasource-readback.json`, `dashboard-queries.json`, `targets.json` | readbacks reais e respostas PromQL |

Prometheus separa labels por cenário/perfil/resultado, sem IDs de execução. Histograma
somente completed; Grafana aproxima p95 por buckets, não é percentil exato da rodada.
Counters acumulam as repetições, e rate inclui intervalos entre rodadas.
`upMissingGridSamples=0` não prova cada scrape original: confira timestamps distintos e idade.

Integridade e preparação são **externas ao framework**: SQL independente compara
UPPER(TRIM(nome)), NULLs, fonte imutável e incrementos por ID (inclusive warmup).
Escrita com timeout/erro pode ter efeito ambíguo; registrar contagem e limites por ID,
não presumir rollback de resposta perdida. Cleanup remove só schemas próprios e o
runner relê sua ausência antes de salvar sucesso. Não reintroduz validate/restore em src.

```bash
npm test
npm run test:integration
node --test observability/collector.test.cjs observability/targets.test.cjs
node observability/export-verify.cjs
```

## Pendências honestas

Amostra pequena, apenas EXP-06, um batch size, três repetições. Duas rodadas de escrita
A tiveram menos de dez requisições em voo sobrepostas ao executor; isso sinaliza
cobertura descritiva insuficiente, não é limiar estatístico. Sobreposição do executor
não demonstra bloqueio SQL. Não concluir superioridade a partir dos gráficos.

Etapa E integral/F ainda exigem cronômetro definitivo do protocolo, matriz de volumes/
lotes/taxas, mais repetições, overhead/caches/recursos/locks isolados e backup/restauração
certificados externamente. Nova campanha massiva exige escopo e autorização separados.
Não alterar guardas pequenas para fazê-la caber.

## Glossário

- **Controle/baseline:** carga sem manutenção, referência da comparação.
- **Piloto:** ensaio pequeno do método, não conclusão definitiva.
- **Seed:** número para repetir sequência de IDs/agendamentos.
- **p95:** valor abaixo do qual ficam aproximadamente 95% das respostas escolhidas.
- **Throughput/vazão:** quantidade concluída por segundo.
- **Warmup:** aquecimento anterior à janela medida, separado das métricas principais.
- **Drain:** aguardar trabalho e cancelamentos pendentes terminarem.
