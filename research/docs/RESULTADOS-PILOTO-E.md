> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Resultados do piloto E — desempenho preliminar

## Resposta curta

O piloto real terminou: **18 rodadas, 7.200 requisições oferecidas, 7.192 concluídas,
8 descartadas, nenhum erro SQL e nenhum timeout**. A integridade independente passou
e todos os schemas criados foram removidos e consultados novamente.

**Não há evidência suficiente para dizer que batch é superior.** Neste conjunto pequeno,
A terminou a manutenção antes de B. A carga concorrente ficou próxima da taxa oferecida
nos três cenários. Pequenas diferenças de latência não demonstram vantagem causal.

## O que foi executado

- Banco real confirmado: `tcc_framework_test`; 1.000 linhas sintéticas novas por rodada.
- EXP-06: normalizar nomes. Controle não executa manutenção; A usa uma transação;
  B usa dez lotes de 100, sem pausa artificial e sem `pg_sleep`.
- Perfis separados: leitura por ID e escrita por ID somente em `load_counter`.
  A escrita não altera nome, resultado normalizado ou critério de seleção.
- Em cada perfil: três repetições por cenário, ordem controle/A/B, A/B/controle,
  B/controle/A. Mesma seed 424242 e mesma sequência de IDs/agendamentos.
- Carga: 100 chegadas/s durante 4 s; aquecimento de 1 s; concorrência máxima 2,
  fila 8, deadline 500 ms. A/B disparados após aproximadamente 1 s.
- O limite de 1.000 linhas foi mantido. A taxa 100/s oferece mais chances de sobreposição
  que o piloto inicial de 30/s, sem aumentar volume nem alongar o SQL de manutenção.

## Latência e vazão da carga concorrente

Valores abaixo são **medianas de três estatísticas por rodada**, não percentis globais.
Latência em milissegundos desde a chegada agendada, incluindo atrasos do gerador,
fila e pool; apenas respostas concluídas. Vazão em respostas/s, incluindo drain.
As contagens somam as três rodadas (1.200 oferecidas por linha).

| Perfil | Cenário | Concluídas | Erros | Timeout | Descartes | p50 ms | p95 ms | p99 ms | Vazão resp/s |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Leitura | Controle | 1198 | 0 | 0 | 2 | 7,93 | 16,05 | 34,68 | 99,86 |
| Leitura | A | 1195 | 0 | 0 | 5 | 7,84 | 15,98 | 46,02 | 99,89 |
| Leitura | B | 1200 | 0 | 0 | 0 | 6,70 | 14,96 | 17,41 | 99,88 |
| Escrita | Controle | 1200 | 0 | 0 | 0 | 9,87 | 29,37 | 59,05 | 99,77 |
| Escrita | A | 1199 | 0 | 0 | 1 | 9,28 | 27,86 | 67,19 | 99,62 |
| Escrita | B | 1200 | 0 | 0 | 0 | 8,74 | 27,58 | 54,57 | 99,97 |

**Em linguagem simples:** o sistema respondeu perto de 100 vezes por segundo porque
oferecemos 100 requisições/s. Isso não mede a capacidade máxima. Houve descartes até
sem manutenção; não podemos atribuir cada descarte a um bloqueio de A. Não escondemos
as requisições descartadas nem as incluímos como respostas rápidas nos percentis.

## Tempo da manutenção e sobreposição

| Perfil | Modo | Mediana dispatch→retorno ms | Trabalho committed mediano ms | Requisições em voo sobrepostas nas três rodadas |
|---|---|---:|---:|---|
| Leitura | A | 100,59 | 15,35 | 11 / 10 / 26 |
| Leitura | B | 439,84 | 77,46 | 50 / 41 / 45 |
| Escrita | A | 73,67 | 14,12 | 8 / 10 / 8 |
| Escrita | B | 446,38 | 78,63 | 46 / 40 / 59 |

Dispatch→retorno inclui posse, controle e auditoria: **não é o cronômetro DML do protocolo**.
Trabalho committed soma os intervalos instrumentados anteriores a checkpoint/commit;
também não mede o tempo completo da operação. B realizou mais commits e apresentou
maior duração observada; a contribuição de cada custo adicional não foi isolada.
Isso não permite extrapolar para milhões de linhas.

A sobreposição usa o intervalo amplo do executor, não prova espera por lock no SQL.
Duas rodadas de escrita A ficaram abaixo de dez requisições sobrepostas, nossa regra
apenas descritiva de cobertura insuficiente. Os percentis da janela inteira incluem
muito tempo fora da manutenção. Três repetições e um único tamanho de lote não
sustentam conclusão estatística nem decisão sobre escalabilidade.

## Verificações reais e monitoramento

- 18/18 consultas independentes: zero divergências da transformação e dos contadores;
  fonte preservada. Escrita: 4.499 incrementos confirmados, incluindo aquecimento;
  nenhuma escrita de resultado ambíguo neste piloto.
- A confirma um lote; B confirma dez. Zero confirmações de lote ausentes.
- 18/18 schemas próprios ausentes após cleanup; consulta final do catálogo retornou
  **zero** schemas `phase_c_test_<32 hex>`.
- Prometheus: 115 séries, 11.040 amostras CSV, 96 timestamps distintos de scrape;
  nenhuma amostra `up=0`, nenhuma lacuna na grade consultada. Maior idade observada
  aproximadamente 0,647 s. Grade sem lacunas não equivale a provar cada scrape original.
- Grafana: dashboard e datasource `tcc-prometheus` conferidos por API; cinco consultas
  de painéis executadas, nenhuma sem série. Contadores relidos no Prometheus conciliados
  por perfil/cenário/resultado com os JSONs. HTTP do collector 9464 confirmado 200.
- CPU/RSS brutos estão nos eventos; **não comparamos recursos isolados de A/B**:
  gerador e executor compartilham Node. Amostra RSS não é pico exato. cAdvisor observa
  containers Linux, não o processo Windows. O exporter PostgreSQL da stack aponta
  ao backup histórico, não à fixture: suas séries não são atribuídas a este piloto.

## Arquivos e rastreabilidade

Diretório absoluto da execução concluída:

```text
M:/ProjetoTcc/Processamento_em_loteV5/experiments/results/phase-e-2026-10-19T14-43-33-286Z-27105d
```

`manifest.json` registra configuração, checksums, ordem, runtime, banco e cada rodada.
`trial-{read|write}-*.json` e `.csv` preservam os dados brutos; JSON inclui aquecimento,
eventos, integridade e leitura de cleanup. `performance-summary.json` foi agregado
programaticamente destes arquivos. `load.prom`, catálogo, range JSON/CSV, cobertura,
queries e readbacks de dashboard/datasource preservam evidência de monitoramento.
A pasta é ignorada pelo Git, não removida.
`post-run-verification.json` confere 7.200 linhas CSV, contabilidade e agendamento
idêntico. Após a coleta mudaram apenas a validação estrita da lista read/write e
legendas/texto do dashboard; SQL, núcleo e gerador medidos não mudaram. Manifesto
original preservado. `dashboard-final-readback.json` registra a versão final, lida
após reinício somente do Grafana para atualizar o bind.
`cleanup-final-readback.json` registra a consulta final real do catálogo.

Tentativa anterior desta entrega, preservada em
`experiments/results/phase-e-2026-10-19T14-41-51-788Z-09e872`, ficou `failed` após
nove rodadas de leitura a 200/s. Seus dados não foram misturados à tabela acima.
O erro daquela versão foi suprimido sem classificação persistida; não afirmamos a causa.
Na execução concluída a configuração foi reduzida para 100/s e o aquecimento aumentado
para 1 s. O runner agora registra classificação segura e contagens quando reprova aquecimento.

Essa escolha foi **exploratória**: ajustamos a configuração depois de uma tentativa
falha. Isso traz risco de seleção favorável; portanto, a execução concluída serve para
verificar o procedimento, não para confirmar uma hipótese de desempenho. Antes da
campanha definitiva, fixaremos a configuração e os critérios de falha sem escolhê-los
conforme os resultados. Para fortalecer a rastreabilidade futura, o manifesto também
deverá registrar os hashes dos módulos de `dist` efetivamente executados, além de `src`;
o manifesto atual não comprova sozinho a equivalência entre fonte e build.

## Aceite e limites

Build aprovado; `db:check` confirmou o destino; **50/50 unitários, 62/62 integrações e
4/4 testes de observabilidade** passaram, sem skips. Guarda de piloto único e perfil
write tiveram RED/GREEN real. Verificação D: quatro alvos permanentes ativos;
painéis D sem série permanecem explicitamente ausentes, não convertidos em zero.

Concluído: piloto funcional sintético, leitura/escrita separadas, exclusão concorrente,
contabilidade, evidência bruta e interpretação preliminar. **Etapa E integral e campanha F
não encerradas:** faltam cronômetro definitivo, matriz de lotes/volumes, repetições mais
robustas, avaliação isolada de recursos/locks/overhead e certificação externa de
backup/restauração. Nenhum resultado em produção é prometido. Não houve benchmark
massivo, instalação, edição de `.env`, commit/push nem escrita na origem/backup/postgres.

Revisão independente aceita pelo agente principal: números brutos, contabilidade,
sequência de carga e fingerprints iniciais conferidos, sem bloqueador para este piloto
funcional parcial. O revisor não executou operações no banco nem repetiu a suíte.
