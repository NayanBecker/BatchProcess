# Fase B — Protocolo experimental proposto e plano de implementação

> **HISTÓRICO — cenário substituído.** Nayan escolheu dez operações sobre tabelas auxiliares em `postgres.public`. A proposta de e-mails sintéticos abaixo não deve orientar a implementação. Contrato atual: `docs/experiments/protocol.md`; resumo: `STATUS-TCC.md`. `tcc_framework_test` permanece para desenvolvimento. O texto anterior foi preservado para rastreabilidade, não representa aprovação.

**Status: RASCUNHO PARA APROVAÇÃO DE NAYAN.** Nenhum schema, job, baseline ou mudança transacional foi implementado por este documento. Nenhum benchmark foi executado. Após aprovação, consolidar a versão aceita em `docs/experiments/protocol.md` antes da implementação e dos experimentos.

**Goal:** definir exatamente qual operação será comparada e quais garantias cada modo oferece, sem confundir lote de leitura, comando SQL e transação.

**Architecture:** preservar CLI, registry, gerenciamento e persistência existentes. Acrescentar incrementalmente uma capacidade de processamento set-based por lote com contexto Knex.Transaction, incluindo escritas de domínio e checkpoint no mesmo commit. Manter o caminho legado item a item identificado separadamente; não o chamar de transação por lote.

**Tech Stack:** Node.js, TypeScript, Knex, PostgreSQL, Docker; instrumentação futura com Prometheus/Grafana. Não acrescentar stack alternativa.

---

## 1. Evidências do código atual

Inspeção em 02/10/2026, branch `BatchProcessor_v7`; alterações da Fase A preservadas.

- `src/core/BatchIterator.ts:21-35`: busca pelo `queryBuilder` e executa usando `db.raw`, sem receber uma transação.
- `src/core/BatchJob.ts:43-48`: contexto de item não contém executor transacional. `processItem` é a operação abstrata (`:104`).
- `src/core/BatchJob.ts:162-165`: paginação por `id > cursor`, sem teto de IDs.
- `src/core/BatchExecutor.ts:79-124`: busca lote e processa item por item; falha definitiva de item não aborta necessariamente o lote.
- `src/core/BatchExecutor.ts:126-136`: checkpoint separado das escritas; sua falha é registrada e o fluxo prossegue.
- `src/core/BatchExecutor.ts:138-140`: throttle é aplicado depois do lote.
- `src/types/index.ts:70-87`: estado persistido não apresenta um campo de teto do conjunto experimental.

**Conclusão da leitura:** o V5 atual não implementa o modo transacional B aqui proposto. Abrir `db.transaction` no executor sem encaminhar `trx` ao job/iterator/checkpoint não resolve essa diferença. Esta conclusão é de leitura do fonte, não resultado de teste de falhas do núcleo.

A publicação de conclusão da Fase A no Notion foi relida e confirmada nesta retomada. A Fase A não validou os mecanismos acima.

## 2. Cenário principal recomendado

### Objetivo e hipótese

Simular uma manutenção massiva de cadastro: preencher uma coluna normalizada a partir de uma coluna de origem, enquanto outras operações acessam o banco.

**Hipótese, não resultado:** dividir a atualização em transações menores pode reduzir duração de bloqueios e interferência nas operações concorrentes, ao custo de mais commits, consultas de controle e eventualmente maior duração total. Também pode não trazer benefício; ambos os resultados são válidos.

### Operação

Tabela sintética proposta: `experiment.customers`, somente no banco `tcc_framework_test`. Não usar nem copiar `postgres.public.receitafederal_quadrosocietario` no cenário principal.

| Coluna proposta | Tipo/regra | Papel |
|---|---|---|
| `id` | integer, positivo, chave primária | Identidade imutável; IDs explícitos 1..N na geração inicial |
| `email_raw` | text, nullable, collation C | Origem sintética imutável durante uma rodada |
| `email_normalized` | text, nullable, collation C | Destino da manutenção |
| `activity_count` | bigint, NOT NULL, default 0 | Escrita concorrente sem mudar a expressão da manutenção |
| `payload` | text, NOT NULL | 128 caracteres ASCII fixos para controlar largura da linha |

Índice principal: apenas a chave primária B-tree em `id`. Nenhum índice em `email_normalized`, trigger ou FK de domínio no cenário inicial. A influência de índice na coluna atualizada seria outro cenário, não misturada à comparação principal. Registrar DDL e `fillfactor` efetivos; não presumir que todas as atualizações serão HOT.

Expressão compartilhada proposta:

```sql
NULLIF(lower(btrim(email_raw)), '')
```

Regras: retirar espaços ASCII das extremidades, converter letras ASCII para minúsculas, mapear NULL/vazio/somente espaços para NULL. Não é validador de e-mail real nem política universal para endereços de produção. Dados sintéticos usam domínio `example.test`; tabs e normalização Unicode ficam fora deste cenário.

Predicado da atualização: pertencimento ao intervalo alvo e valor atual **IS DISTINCT FROM** a expressão esperada. Isso trata NULL corretamente e evita reescrita de linhas já normalizadas. A transformação é idempotente enquanto a origem permanecer fixa.

## 3. Dataset, seed e conjunto congelado

Parâmetros propostos: `dataset_version=customers-v1`, `seed=20261002`, `N` definido antes de cada cenário. A seed é identificador/parâmetro determinístico da geração; não usar `Math.random()` sem algoritmo/versionamento.

Gerador proposto, ainda não executado:

- IDs inteiros consecutivos de 1 a N, com limites compatíveis com integer PostgreSQL.
- Para cada ID, calcular `r = (id + seed) mod 20`, em aritmética inteira.
- `r=0`: `email_raw=NULL`.
- `r=1`: `email_raw='   '`.
- `r=2`: `email_raw='user' || id || '@example.test'`, já normalizado.
- Demais casos: `email_raw=' USER' || id || '@EXAMPLE.TEST '`.
- Inicializar `email_normalized` como a expressão correta para `r=2`; nos outros casos usar o marcador fixo `pending`.
- `activity_count=0`; payload fixo igual em todas as rodadas.

Calcular e guardar contagens reais por categoria após gerar; não supor percentuais exatos para N não múltiplo do período. Incluir fixture pequena com NULL, string vazia, espaços, já normalizado e valor antigo incorreto nos testes de integridade, mesmo que a geração grande não cubra todas as variantes.

### Corte lógico

Antes de iniciar carga e operação, congelar o conjunto: persistir `lower_id=0`, `upper_id=H=max(id)`, N observado, quantidade inicialmente divergente, seed, versão do dataset e fingerprint do estado inicial. Guardar H no estado durável associado à execução; retomada nunca recalcula `max(id)`.

**Cenário principal:** proibir INSERT, DELETE e alterações de `id`/`email_raw` durante a rodada. A carga concorrente pode ler e, no perfil de escrita, alterar somente `activity_count`. Assim H delimita um conjunto estável e a expressão não depende de dados mutáveis.

**Inserções concorrentes:** fora do ensaio principal. Em teste funcional separado, inserções devem receber IDs estritamente maiores que H; ficam excluídas desta execução e são verificadas como não alteradas. Inserir manualmente IDs abaixo de H, excluir linhas ou alterar a origem viola o protocolo. H sozinho não é um snapshot MVCC nem congela arbitrariamente linhas que mudem durante a execução.

### Preparação e volumes

Cada repetição restaura o mesmo estado inicial físico/lógico conforme procedimento versionado, incluindo coluna normalizada, activity_count, índices e estatísticas; não executar B sobre a tabela que A acabou de normalizar. Preferir reconstrução/restauração consistente a apenas UPDATE de reset, que acumula tuplas mortas de modo diferente.

Proposta inicial para piloto: N=100000; lotes candidatos 100, 1000, 10000. Esses valores **não estão aprovados nem validados pela capacidade do host**. O piloto deve verificar duração suficiente para observar carga concorrente, espaço, recursos e capacidade de repetição. A matriz final será congelada após o piloto, antes dos ensaios principais; não escolher parâmetros apenas por favorecer o batch.

## 4. Modo A — monolítico

- Um worker/controlador e uma conexão de trabalho, como no modo B.
- Uma transação PostgreSQL `READ COMMITTED` para toda a atualização de domínio em `0 < id <= H`.
- Um UPDATE set-based utilizando a expressão e o predicado de divergência compartilhados.
- Se o baseline usar o estado do framework, gravar avanço final/contadores correspondentes na mesma transação. Inicialização administrativa antes do trabalho deve ser equivalente nos dois modos e identificada nos tempos.
- Commit único dos dados transformados; nenhuma pausa artificial.
- Erro antes do commit provoca rollback de toda a operação de domínio. Não tratar isso como atomicidade de logs auxiliares gravados fora da transação.

A transação A não deve virar um loop de UPDATE individual se o modo B for set-based. Tampouco o baseline deve retirar índices, alterar durabilidade ou mudar limites de recurso.

## 5. Modo B — transações por lote

Contrato proposto, não implementado:

1. Recuperar cursor e contadores do último commit, além de H persistido.
2. Abrir transação `READ COMMITTED`.
3. Definir o limite `hi` pelos próximos **até B IDs existentes**, ordenados, com `cursor < id <= H`. Não calcular `hi=cursor+B` como sinônimo de B registros em dados com lacunas.
4. Dentro da mesma transação, executar UPDATE set-based da mesma expressão para `cursor < id <= hi`, com o mesmo predicado de divergência.
5. Persistir `current_id=hi`, progresso e contadores comprometidos **via a mesma instância trx**, antes do commit. Falha no checkpoint aborta o UPDATE também.
6. Publicar progresso comprometido somente após sucesso do commit.
7. Fazer throttle, quando configurado, **fora da transação e entre lotes**, não depois do último lote nem mantendo locks artificialmente durante o sono.
8. Repetir até esgotar o conjunto fixado; finalizar e validar externamente a integridade.

A seleção da fronteira, o UPDATE e o checkpoint usam a mesma conexão/transação. Hooks que escrevem no domínio também devem obedecer ao contrato; chamadas à conexão global são proibidas nesse caminho transacional. Logs operacionais podem ser gravados separadamente após o rollback/commit, mas não podem anunciar progresso não comprometido.

Distinguir `rows_visited` (linhas do conjunto percorridas), `rows_changed` (linhas efetivamente atualizadas pelo predicado) e cursor (último ID coberto). Se um lote já estiver correto, avançar o cursor mesmo com zero alterações; não entrar em laço infinito. Não somar contadores de tentativas revertidas. Definir explicitamente a compatibilidade de `processed_rows` com essas medidas na implementação.

B é quantidade máxima de registros por lote, não tamanho de transação em bytes, nem número de comandos SQL. Um lote pode conter SELECT, UPDATE e checkpoint e ainda ser uma única transação.

## 6. Equivalência SQL e fatores controlados

Modelo lógico do UPDATE para ambos (placeholders ilustram parâmetros, não interpolação de entrada):

```sql
UPDATE experiment.customers
SET email_normalized = NULLIF(lower(btrim(email_raw)), '')
WHERE id > :lo AND id <= :hi
  AND email_normalized IS DISTINCT FROM NULLIF(lower(btrim(email_raw)), '');
```

A usa `(lo,hi)=(0,H)` uma vez; B usa intervalos consecutivos sem sobreposição/lacunas sobre o conjunto fixo. Compartilhar a construção da expressão/predicado em um módulo para evitar divergência entre implementações.

**Mesmo SQL lógico não significa mesmo plano de execução.** Registrar EXPLAIN sem ANALYZE na fase de inspeção e analisar planos reais somente em execução separada/restaurada; EXPLAIN ANALYZE de UPDATE executa a escrita e não pode contaminar a rodada seguinte. Diferenças de varredura por tamanho de intervalo são parte do comportamento observado, não prova de erro na comparação.

Condições iguais: PostgreSQL/imagem/configuração, durabilidade, máquina, banco alvo, schema/índices, dataset inicial, pool, carga oferecida/seed, timeouts, política de cache, monitoramento e limites Docker. Manter autovacuum e checkpoints com política idêntica e registrar quando atuarem; não alterar apenas em um modo.

O framework B tem custo de fronteiras/checkpoints/múltiplos commits. Contabilizar esse custo, não subtraí-lo silenciosamente. A conclusão principal é sobre a configuração operacional completa, não causalidade isolada do tamanho de transação. Comparação isolando overhead do framework pode ser experimento secundário.

### Separar tamanho de lote de throttle

- Comparação primária: A versus B com `throttle_ms=0`, variando B.
- Comparação secundária: fixar B escolhido por critério declarado e variar throttle.
- Não atribuir uma eventual melhora somente a transações menores quando batch size e throttle mudarem simultaneamente.
- Um job/worker massivo por vez no estudo inicial. Concorrência de jobs é outro fator.

## 7. Carga concorrente e interpretação

Desenho recomendado para detalhamento nas fases de carga/piloto:

- **Controle sem manutenção massiva:** mesma carga, sem A/B, para quantificar a degradação.
- **Perfil R — consultas:** consultas por PK e pequenas faixas, sem SELECT FOR UPDATE. Avalia interferência em recursos/latência; no PostgreSQL, UPDATE não implica bloqueio direto de todo SELECT comum por causa do MVCC.
- **Perfil W — consultas e escritas sobre linhas alvo:** além de leituras, operações curtas incrementam apenas `activity_count` em IDs do conjunto. Colunas diferentes na mesma linha ainda podem disputar locks de linha. Isso exercita contenção relevante sem tornar a normalização não determinística.
- Executar R e W como estratos separados, e A/B/controle com a mesma carga dentro de cada estrato; não misturar resultados sem indicar o perfil.
- Gerador com taxa de chegada controlada, seed e sequência de IDs registradas. Registrar carga oferecida, concluída e backlog; evitar que um gerador fechado reduza automaticamente a carga quando o banco fica lento e esconda o impacto.
- Timeouts e erros são observações, não amostras descartadas. Percentis de sucesso devem ser acompanhados de erros/timeouts/volume amostral.

Fixar uma janela comum com pré-carga, janela de comparação e pós-carga no piloto. A janela deve comportar os cenários previstos; se uma execução excedê-la, registrar censura/limite e não declarar conclusão normal. Reportar tanto métricas em janela comum quanto durante a operação ativa e recuperação, sem confundir denominadores quando B durar mais.

Métricas pretendidas: tempo total (incluindo throttle/controle definido), tempo de transação/lote, linhas visitadas/alteradas por segundo, latência p50/p95/p99 quando suportada pela amostra, throughput/erros/timeouts concorrentes, CPU/memória/I/O ao longo do tempo, sessões esperando locks, duração das esperas, deadlocks, commits, conexões e autovacuum. São requisitos de instrumentação futura, não nomes de métricas Prometheus existentes nem medições já realizadas.

Planejar múltiplas repetições e alternar/aleatorizar a ordem com seed registrada; cinco repetições por configuração são ponto de partida proposto, sujeito ao piloto. A duração total sozinha não define vencedor.

## 8. Integridade final — aprovação por dados

Registrar antes da execução: N alvo, H, número de linhas divergentes, contagens de nulos/vazios/já corretos e fingerprint ordenado das colunas imutáveis. Os detalhes do algoritmo de fingerprint devem ser versionados; não usar dump com timestamps voláteis como prova de igualdade lógica.

Após o commit final, com a carga concorrente encerrada e sem consultas de validação dentro da janela medida:

```sql
SELECT count(*) AS target_rows,
       count(*) FILTER (
         WHERE email_normalized IS DISTINCT FROM
               NULLIF(lower(btrim(email_raw)), '')
       ) AS divergent_rows
FROM experiment.customers
WHERE id > 0 AND id <= :H;
```

Critérios cumulativos:

- `target_rows` igual à contagem inicial, e conjunto de IDs/origem/payload imutável.
- `divergent_rows=0` em ambos os modos, inclusive para nulos e valores já corretos.
- Estados finais de `(id,email_raw,email_normalized,payload)` equivalentes ao resultado esperado e entre A/B. Não comparar `activity_count` como se devesse ser idêntico: throughput concorrente pode diferir; verificar sua própria consistência pelo log de operações comprometidas quando aplicável.
- Linhas fora do corte permanecem intactas quanto à transformação (teste de inserção separado).
- Cursor/contadores correspondem apenas a commits. Linhas inicialmente corretas distinguem visited de changed.
- Reexecutar a transformação sobre resultado concluído mantém o estado e produz zero UPDATEs efetivos com o predicado proposto.

Status `completed` e checksums, isoladamente, não substituem a consulta de divergências. Em caso de falha de integridade, preservar evidências, classificar a execução inválida e investigar; não agregá-la como sucesso de desempenho.

## 9. Falhas, retomada e atomicidade

**Política inicial proposta:** abortar no primeiro erro de lote, sem retry automático escondido nos benchmarks. Experimentos de falha/recuperação são separados das rodadas sem falha induzida. Repetição automática futura precisa de política explícita, limitada e incluída nas métricas.

| Momento da falha | A — monolítico | B — transação por lote |
|---|---|---|
| Antes de commit | Toda a transformação da transação é revertida | UPDATE e checkpoint do lote são revertidos juntos; lotes anteriores ficam comprometidos |
| Checkpoint falha | Não confirmar o resultado de domínio se fizer parte do estado atômico | Abortar lote; cursor permanece no último commit |
| Processo cai antes do commit | PostgreSQL desfaz a transação quando a sessão termina | Mesmo comportamento para o lote em aberto |
| Commit confirmado no servidor, resposta perdida | Verificar estado durável antes de repetir | Reconectar e consultar checkpoint durável; não assumir que o rollback aconteceu |
| Log/evento falha após commit | Não desfazer mentalmente o dado já confirmado | Não reaplicar cegamente lote confirmado; reconciliar com checkpoint |

Retomada explícita exige H original, cursor/contadores duráveis e posse exclusiva da execução. Um segundo worker não pode avançar simultaneamente o mesmo cursor; estratégia de aquisição/recuperação precisa de testes na Fase C. Idempotência da expressão ajuda a repetição, mas não é alegação de entrega exactly-once, nem cobre efeitos externos.

**Diferença de garantia deliberada:** A oferece atomicidade global da transformação; B expõe prefixos comprometidos e estado parcialmente normalizado entre commits. Estados finais equivalentes sem falhas não implicam atomicidade/visibilidade equivalente durante a execução. Se o domínio exigir tudo-ou-nada global, B não é substituto equivalente sem estratégia adicional — limitação explícita do estudo.

Timeout deve cancelar a operação no PostgreSQL/encerrar a transação conforme política validada. `Promise.race` que só abandona a espera no Node não comprova cancelamento do SQL. Distinguir orçamento total de execução dos limites por statement/transação, já que um statement A cobre toda a operação e um statement B cobre só um lote.

## 10. Implementação posterior, condicionada à aprovação

Nomes abaixo são **propostos**, não símbolos/arquivos existentes ou código pronto.

1. Consolidar protocolo aprovado em `docs/experiments/protocol.md`, com versão e decisões aceitas.
2. Criar schema/gerador experimental separados das migrations do núcleo: `experiments/schema/`, `experiments/seed.ts`. Não ativar geração pesada por `npm run migrate`.
3. Criar testes de pureza/determinismo da expressão, fixtures de nulos, idempotência e equivalência A/B antes da implementação.
4. Acrescentar contexto transacional e capacidade de batch set-based em `src/core/BatchJob.ts` e tipos compartilhados, preservando o contrato legado. Definir assinatura precisa e compatibilidade no desenho da Fase C; nenhuma alteração silenciosa da semântica dos jobs antigos.
5. Adaptar `src/core/BatchIterator.ts` para teto durável e conexão transacional no caminho novo.
6. Adaptar `src/core/BatchExecutor.ts` para envolver seleção, UPDATE e checkpoint num commit, abortando quando qualquer uma falhar; throttle fora da transação.
7. Adaptar `src/db/models/BatchJobModel.ts` e migrations do núcleo para estado durável necessário (teto/contadores/identificação), com conexão transacional explícita. Cobrir retomada sem zerar contadores.
8. Criar expressão comum em `experiments/operation.ts`, job experimental em `src/jobs/NormalizeCustomerEmailsJob.ts` e baseline em `experiments/monolithic.ts`. Planejar a compilação dos scripts fora de `src` de forma explícita: `tsconfig.json` atual exclui testes/exemplos e tem rootDir `src`; não presumir que compila `experiments/` automaticamente.
9. Testar erro após UPDATE e antes do checkpoint, falha de checkpoint, rollback, perda de resposta do commit, corte de IDs, lotes com lacunas, lote final menor, lote já correto, dataset vazio e impedimento de dois workers para o mesmo job.
10. Reexecutar testes da Fase A e os testes novos em `tcc_framework_test`. Antes de benchmarks, obter teste de integridade verde, validação transacional e protocolo de carga/recursos finalizado.

Método de implementação: ciclos teste falhando → ajuste mínimo → teste passando, sem commit/push automático. Não tratar os riscos de retry, lease, pausa/retomada e timeout como resolvidos apenas por adicionar transação.

## 11. Alternativa se a mudança transacional for adiada

Avaliar o V5 existente como **leitura em lotes com processamento/escrita individual**, descrevendo commits/autocommit e custo de chamadas. Para controlar granularidade SQL, comparar item a item nos dois modos ou tratar explicitamente set-based versus item a item como outro fator. Não rotular esse resultado como evidência de transação por lote.

## 12. Aprovação solicitada

Decisão principal: adotar normalização de e-mails **sintéticos**, com SQL set-based equivalente e checkpoint atômico por lote, como contrato do estudo? Isso aprova o desenho; não afirma que a implementação já existe.

Alternativas: manter o V5 sem transação por lote e mudar a pergunta/rotulagem, ou escolher outra transformação de domínio antes de consolidar o protocolo. Volumes, carga e repetições definitivos dependem de piloto posterior; não bloqueiam a aprovação do contrato da operação.

**Gate:** sem aprovação deste desenho e sem testes transacionais/integridade verdes, não iniciar benchmarks nem concluir que batch reduz impacto.
