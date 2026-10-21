# Retomada e conclusão do TCC II — Plano de implementação e pesquisa

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> A instrução acima é um encaminhamento para implementação futura, condicionada à disponibilidade da skill e à autorização do autor. Esta entrega é somente planejamento.

**Objetivo:** concluir e avaliar o protótipo iniciado no TCC I, produzindo evidências reproduzíveis sobre seus impactos em comparação com processamento monolítico e documentando resultados, limitações e conclusões.

**Arquitetura:** preservar CLI, JobRegistry, JobManager, BatchJob, BatchIterator, BatchExecutor e persistência PostgreSQL. Corrigir incrementalmente o ciclo de vida e definir limites transacionais antes de medir desempenho. Não transformar o trabalho em uma plataforma distribuída completa.

**Stack:** Node.js, TypeScript, Knex, PostgreSQL, Docker Compose, Prometheus e Grafana.

---

## 1. Premissas e regras do plano

- Todo o material enviado até aqui pertence à trajetória do **TCC I**, inclusive o fonte V5. A existência de código não significa que uma etapa do TCC II esteja validada.
- Raiz do fonte: `M:\ProjetoTcc\Processamento_em_loteV5`. Caminhos de código abaixo são relativos a essa raiz. Novos caminhos são propostas, não arquivos existentes.
- Contexto: `C:\Users\nayan\AppData\Local\hermes\profiles\project-tcc-worker\context\tcc\CONTEXTO.md`.
- Referência detalhada: https://app.notion.com/p/3e891ebdb768819d99b0d376a9d0d040
- Achados anteriores vieram de análise estática. Primeiro reproduzir/confirmar; depois corrigir e testar. Não declarar antecipadamente que todos são falhas observadas em execução.
- Não executar migrations, rollback ou carga no banco existente antes de identificar o ambiente e isolar um banco descartável de testes.
- Não há prazo de entrega nem disponibilidade semanal atual confirmados. Este roteiro usa marcos e dependências; não representa compromisso de datas. O cronograma do PDF é histórico/proposto.
- Testes e coleta corretos têm prioridade sobre novas funcionalidades. A redação acompanha o desenvolvimento, não fica toda para o final.

## 2. Resultado mínimo para considerar o TCC II concluído

1. Protótipo reproduzível e funcional nos requisitos assumidos, com limitações explícitas.
2. Monolítico e batch executando a mesma transformação sobre dados equivalentes, com resultado final validado.
3. Carga concorrente mensurada e referência sem processamento massivo.
4. Instrumentação documentada e coleta de dados brutos identificados por experimento e repetição.
5. Experimentos repetidos sob condições controladas, com perdas, erros e exclusões registrados.
6. Análise de disponibilidade/latência, recursos, contenção e duração, sem presumir vantagem de batch.
7. Monografia revisada, evidências organizadas e apresentação preparada.

## 3. Fase A — Retomar e estabelecer uma base reproduzível

**Objetivo:** conseguir preparar e executar o projeto com segurança a partir de instruções documentadas.

### Tarefas
- [ ] Confirmar com Nayan prazo oficial, horas disponíveis e orientações atuais do orientador.
- [ ] Conferir fonte atual e Git sem descartar alterações; registrar uma referência de versão da base do TCC I.
- [ ] Identificar versões reais de Node/PostgreSQL, dependências resolvidas, hardware e serviços Docker/observabilidade eventualmente externos à pasta.
- [ ] Definir ambiente de teste separado e registrar quais comandos podem modificar dados.
- [ ] Unificar configuração de conexão entre runtime e migrations; remover credenciais do fonte, usar variáveis de ambiente e exemplo sem segredos. Se credencial real foi exposta, avaliar rotação; não apagar histórico indiscriminadamente.
- [ ] Corrigir rastreamento de arquivo de segredos e documentar carregamento das variáveis.
- [ ] Verificar inicialização limpa, paths das migrations e compatibilidade de importações `.js`/`.ts` nos modos dev e compilado.
- [ ] Reconciliar schema dos exemplos: `contacts_user` não tem migration encontrada; `update_at` do exemplo users não existe na migration lida.
- [ ] Corrigir rollbacks inconsistentes exclusivamente após testes em banco descartável; se migrations já foram aplicadas, preferir evolução compatível em vez de modificar silenciosamente histórico de ambientes existentes.
- [ ] Atualizar comandos e documentação local desatualizados.

**Arquivos prováveis:** `src/db/conection.ts`, `src/db/knexfile.ts`, `src/db/migrations/002_create_users.ts`, `src/db/migrations/004_add_job_metadata.ts`, nova migration para schema escolhido, `.gitignore`, novo `.env.example`, `package.json`, `# Sistema de Processamento em Lote - Doc.md`.

**Validação futura:** no ambiente isolado, executar `npm ci`, `npm run build`, `npm run migrate`; ensaiar rollback e reaplicação somente no banco descartável. Confirmar CLI dev e compilada. Não há resultado desses comandos nesta entrega.

**Saída:** ambiente documentado, configuração sem segredos e schema reproduzível.

## 4. Fase B — Definir exatamente o que será comparado

**Objetivo:** impedir uma comparação ambígua entre lote de leitura, comando SQL e transação.

### Decisão recomendada
O V5 busca registros em lotes, mas os exemplos atualizam item por item. Para a avaliação principal, definir explicitamente processamento com **transação por lote**, incluindo checkpoint na mesma transação quando ambos usam o mesmo banco. Preservar a API existente sempre que possível, acrescentando contexto transacional e/ou operação por lote de modo incremental.

Essa é uma recomendação de desenho a validar antes da implementação, não uma alteração já aprovada. Uma transação só no executor não basta se o job continuar usando a conexão global fora dela.

### Tarefas
- [ ] Escolher uma transformação simples, determinística e idempotente como cenário principal; documentar tabela, predicado, índices, colunas e tratamento de nulos.
- [ ] Definir dataset fixo, seed e teto de IDs/corte lógico no início. Documentar o que acontece com inserções concorrentes.
- [ ] Especificar modo A: uma transação para a operação completa.
- [ ] Especificar modo B: operações equivalentes em transações por lote, com tamanho e throttle configurados.
- [ ] Preferir a mesma expressão SQL set-based nos dois modos, limitando o intervalo no batch. Se a lógica exigir item a item, controlar também esse fator no desenho.
- [ ] Definir integridade final por contagem e consulta de divergências, não apenas status completed.
- [ ] Registrar contrato de falhas: abortar lote e manter cursor no último commit é uma base recomendada; reprocessamento deve ser explícito e idempotente.
- [ ] Documentar atomicidade global do monolítico versus atomicidade por lote do batch. Igualdade do estado final sem falhas não implica equivalência de atomicidade durante a execução.

**Arquivos prováveis:** `src/core/BatchJob.ts`, `src/core/BatchExecutor.ts`, `src/core/BatchIterator.ts`, `src/types/index.ts`, job experimental em `src/jobs/`, baseline em `experiments/monolithic.ts`, contrato em `docs/experiments/protocol.md`.

**Saída:** protocolo da operação e limites transacionais aprovado antes dos benchmarks. Caso a mudança por lote seja adiada, avaliar o V5 como leitura em lotes/escrita individual e explicitar os fatores adicionais; não chamá-lo de transação por lote.

## 5. Fase C — Corrigir e testar a confiabilidade do núcleo

**Objetivo:** dados, estados e contadores confiáveis antes de medir desempenho.

Para cada correção: escrever teste que reproduza o risco → executar e confirmar o problema → aplicar mudança mínima → executar teste e regressão → registrar evidência e alteração. Introduzir uma suíte real; o script test atual é placeholder.

### C1. CLI e parâmetros
- [ ] Fazer `jobs` e `start` utilizarem nomes consistentes de classes registradas.
- [ ] Validar IDs, batch size, throttle e concorrência; chamar `validate()` no fluxo adequado.
- [ ] Expor parâmetros necessários ao experimento e persistir configuração efetiva, não defaults reconstruídos no DTO.
- [ ] Escolher o exemplo ativo e documentar o arquivado, sem pressupor que Jobs_Dones é carregado.

**Arquivos:** `src/cli/index.ts`, `src/core/JobRegistry.ts`, `src/core/JobManager.ts`, `src/core/BatchJob.ts`, `src/types/index.ts`, migrations e modelos necessários.
**Testes propostos:** `tests/cli.test.ts`, `tests/config.test.ts`.

### C2. Pausa, retomada e contagem
- [ ] Reproduzir resume paused→running versus polling pending e corrigir o caminho de retomada após saída do executor.
- [ ] Garantir que resume funcione com um processo apto a registrar e despachar jobs; separar comando de controle e execução sem exigir reescrita da CLI.
- [ ] Preservar contadores anteriores e cursor confirmado ao retomar.
- [ ] Definir pausa cooperativa entre lotes; não anunciar parada imediata.
- [ ] Evitar apagar job enquanto executor ainda processa; validar transições inválidas com mensagens claras.

**Arquivos:** `src/core/JobManager.ts`, `src/core/BatchExecutor.ts`, `src/db/models/BatchJobModel.ts`, `src/cli/index.ts`.
**Teste proposto:** `tests/integration/job-lifecycle.test.ts`.
**Aceite:** pausar, aguardar parada, reiniciar processo e retomar sem perder dados nem zerar progresso.

### C3. Transações, checkpoint e falhas
- [ ] Implementar o contrato transacional definido na fase B, assegurando que as escritas usem a transação correta.
- [ ] Não continuar silenciosamente após falha de checkpoint.
- [ ] Não avançar cursor deixando falhas sem resolução e depois apresentar sucesso total.
- [ ] Aplicar política de checkpoint suportada ou remover opções não implementadas; para transação por lote, checkpoint por commit é a base mais simples.
- [ ] Parametrizar queries e validar identificadores; delimitar domínio de IDs suportado, inclusive limites de bigint em JavaScript.
- [ ] Ensaiar interrupção antes/depois do commit e reexecução de operação idempotente.

**Arquivos:** `src/core/BatchJob.ts`, `src/core/BatchIterator.ts`, `src/core/BatchExecutor.ts`, `src/db/models/BatchJobModel.ts`, job experimental.
**Teste proposto:** `tests/integration/checkpoint.test.ts`.
**Aceite:** falha não produz avanço incorreto e reexecução não gera corrupção ou duplicação lógica.

### C4. Retry e timeout
- [ ] Substituir a suposição de que Promise.race cancela SQL por um mecanismo de timeout/cancelamento realmente aplicado ao banco, quando disponível.
- [ ] Não iniciar retry enquanto uma operação anterior ainda puder alterar os dados; aguardar cancelamento/rollback confirmado.
- [ ] Limpar timers e definir quais erros são transitórios e quais devem falhar imediatamente.
- [ ] Registrar tentativas, falhas finais e retries com significados diferentes.

**Arquivos:** `src/core/BatchJob.ts`, `src/db/models/BatchJobErrorModel.ts`, `src/types/index.ts`.
**Teste proposto:** `tests/integration/retry-timeout.test.ts`.
**Aceite:** timeout não deixa operações antigas competindo com a nova tentativa; erros e tentativas batem com os registros.

### C5. Concorrência e encerramento
- [ ] Serializar despacho ou reservar capacidade para impedir estouro de slots por polling sobreposto.
- [ ] Preservar aquisição transacional já existente. Avaliar seleção+aquisição atômicas e SKIP LOCKED se múltiplos consumidores fizerem parte do escopo.
- [ ] Definir limite local versus global. Para experimento inicial, um manager é suficiente; não anunciar limite global não implementado.
- [ ] Limpar executores em conclusão, falha, pausa e cancelamento, preferencialmente com finalização garantida.
- [ ] Restringir stop aos executores sob responsabilidade do processo; encerrar pool e polling de forma controlada.
- [ ] Definir recuperação após crash: mecanismo seguro para identificar job órfão e retomada explícita. Lease/heartbeat só se necessário ao escopo; nunca roubar job de worker ainda ativo.

**Arquivos:** `src/core/JobManager.ts`, `src/core/BatchExecutor.ts`, `src/db/models/BatchJobModel.ts`.
**Testes propostos:** `tests/integration/concurrency.test.ts`, `tests/integration/recovery.test.ts`.
**Aceite:** limites respeitados, nenhum job adquirido simultaneamente por dois executores e nenhuma capacidade perdida ao cancelar.

### C6. Métricas internas
- [ ] Implementar retriesCount real ou retirar campo até existir; proteger denominadores zero.
- [ ] Diferenciar duração ativa, pausa, throttle e tempo de parede; documentar a fórmula de throughput.
- [ ] Não apresentar duração total/registros como latência individual medida.
- [ ] Encaminhar os eventos necessários à instrumentação e persistir metadados do experimento.

**Arquivos:** `src/db/models/BatchJobModel.ts`, `src/core/JobManager.ts`, `src/core/BatchExecutor.ts`, `src/types/index.ts`.
**Teste proposto:** `tests/metrics.test.ts`.

**Marco da fase C:** suíte automatizada e validação de integridade aprovadas, evidências RF01–RF08 registradas e limitações RNF explícitas. Não avançar para coleta definitiva enquanto estados ou contadores forem duvidosos.

## 6. Fase D — Ambiente experimental e observabilidade

**Objetivo:** coletar medições verificáveis e reproduzíveis.

- [ ] Reaproveitar serviços externos se adequados; caso contrário, criar Compose com PostgreSQL, Prometheus e Grafana, versões fixadas e limites documentados.
- [ ] Identificar métricas reais disponíveis antes de definir consultas PromQL e dashboards.
- [ ] Separar métricas do Node, PostgreSQL, containers e host; no Windows/Docker documentar a camada de virtualização e o alcance de cada coletor.
- [ ] Medir duração de lote, registros confirmados, falhas, tentativas e progresso; preservar dados brutos por execução em arquivo/banco sem cardinalidade ilimitada nas labels.
- [ ] Medir CPU e memória ao longo do tempo, I/O e métricas PostgreSQL de sessões, espera por locks, deadlocks e transações; tuplas mortas/autovacuum quando disponíveis.
- [ ] Configurar dashboard enxuto voltado a gráficos utilizáveis no TCC.
- [ ] Validar scrape, unidade, reset de counters, ausência de dados e resolução temporal; lote rápido pode exigir registro por evento além do scrape.

**Novos arquivos propostos:** `compose.yaml`, `observability/prometheus/prometheus.yml`, `observability/grafana/provisioning/`, `observability/grafana/dashboards/`, `src/observability/metrics.ts`.

**Aceite:** execução curta com contadores conciliados com o banco, sinais coerentes e coleta exportável. Ausência de métrica é registrada, não substituída por zero inventado.

## 7. Fase E — Carga concorrente e protocolo experimental

**Objetivo:** medir interferência sobre o uso normal do sistema, não só velocidade da manutenção.

### Cenários
- Referência: apenas carga concorrente, sem processamento massivo.
- A: mesma carga concorrente + monolítico.
- B: mesma carga concorrente + framework batch, variando inicialmente apenas batch size.
- Separar depois estudos de throttle e número de jobs, se o prazo permitir. Não variar tudo ao mesmo tempo.

### Variáveis
- Independentes: modo, volume e batch size; throttle/concorrência em estudos complementares.
- Dependentes: tempo, throughput massivo, latência p50/p95 e p99 com amostra suficiente, throughput e erros/timeouts concorrentes, recursos e contenção.
- Controle: dataset inicial, seed, transformação, índices, versão/configuração PostgreSQL, hardware/limites, pool, carga oferecida, isolamento e política de caches.

### Procedimento
- [ ] Criar seed determinístico e rotina de restauração/reset verificada.
- [ ] Criar carga representativa com leitura e escrita; SELECT sob MVCC não demonstra sozinho conflito de atualização. Definir se há disputa pelas mesmas linhas sem modificar de modo inconsistente a transformação avaliada.
- [ ] Fixar distribuição de acesso e carga oferecida. Preferir taxa de chegada controlada; se usar clientes em loop fechado, registrar que a latência reduz a carga oferecida e pode mascarar saturação.
- [ ] Medir latência ponta a ponta, incluindo espera no pool. Registrar requisições tentadas, concluídas, falhas e timeouts separadamente.
- [ ] Separar aquecimento, janela de operação massiva e período de recuperação. Reportar janela comum e efeito ao longo da operação inteira para não favorecer artificialmente um modo mais lento.
- [ ] Fazer piloto para escolher volumes, batch sizes, carga e resolução de coleta; exemplos iniciais de lote: 100, 1000 e 5000, sujeitos ao piloto, não valores finais.
- [ ] Planejar múltiplas repetições; cinco por configuração é um ponto inicial de planejamento, não garantia de precisão estatística.
- [ ] Alternar/randomizar ordem por blocos e registrar caches, checkpoints, autovacuum e interferências. Não desativar manutenção para obter vantagem artificial.
- [ ] Salvar manifesto com EXP-ID, repetição, versão, parâmetros efetivos, horários, dataset, ambiente, arquivos e observações.
- [ ] Validar dados finais após cada execução e registrar critérios prévios de invalidação/repetição.

**Novos arquivos propostos:** `experiments/seed.ts`, `experiments/concurrent-load.ts`, `experiments/run.ts`, `experiments/configs/`, `experiments/results/`, `docs/experiments/protocol.md`.

**Aceite:** piloto dos três cenários completo e reproduzível. Tamanho final da matriz só será fixado após piloto e confirmação do tempo disponível.

## 8. Fase F — Execução definitiva e análise

- [ ] Congelar versão e protocolo antes da coleta definitiva; correção relevante de código exige reavaliar a comparabilidade dos resultados anteriores.
- [ ] Executar matriz e repetições com restauração e validação; preservar dados brutos imutáveis.
- [ ] Conferir dados ausentes, cobertura temporal e correspondência entre cenário e configuração.
- [ ] Resumir resultados por execução; requisições dentro da mesma execução não são repetições independentes.
- [ ] Comparar medianas/médias, dispersão e intervalos adequados ao número de execuções. Não simplesmente tirar média de percentis e chamá-la de percentil global.
- [ ] Analisar outliers com justificativa; não excluir valores desfavoráveis sem critério prévio.
- [ ] Gerar gráficos de duração versus impacto concorrente, latência ao longo do tempo, p95 por cenário, throughput/erros, CPU/memória e espera por locks.
- [ ] Separar observação, interpretação e hipótese explicativa.
- [ ] Relacionar resultados à questão central; aceitar vantagem parcial, trade-off ou ausência de benefício.

**Novos arquivos propostos:** `analysis/`, `docs/results/`, mantendo scripts reproduzíveis e referência aos dados brutos.

**Aceite:** tabelas e gráficos regeneráveis; conclusões limitadas à operação, hardware e cargas efetivamente estudados.

## 9. Fase G — Redação, revisão e defesa

Esta frente acompanha as fases anteriores:
- Após A–C: escrever implementação final, decisões arquiteturais, requisitos atendidos e limitações.
- Após D–E: escrever ambiente, instrumentos, variáveis, protocolo e critérios de integridade.
- Após F: escrever resultados, discussão, ameaças à validade, conclusão e trabalhos futuros.

### Correções acadêmicas incluídas
- [ ] Alinhar metodologia qualitativa/exploratória inicial com a etapa experimental quantitativa efetivamente adotada, validando com orientador.
- [ ] Revisar afirmações universais sobre ACCESS EXCLUSIVE, SELECT e UPDATE; distinguir locks de linha/tabela e MVCC.
- [ ] Conferir figura de locks com documentação oficial; não usar figura de IA como autoridade bibliográfica.
- [ ] Readequar figura/explicação que confunde jobs por registro com execução monolítica transacional.
- [ ] Não afirmar que batch garante autovacuum, elimina bloat ou garante disponibilidade.
- [ ] Diferenciar atomicidade por comando, lote e operação completa conforme a implementação final.
- [ ] Não apresentar o gráfico de Maier como resultado próprio nem generalizar seu cenário para todos os monolíticos.
- [ ] Verificar autores, datas, URLs e aderência das referências; priorizar fontes oficiais e acadêmicas sem inventar citações.
- [ ] Atualizar diagramas e documentação para refletirem o código final.
- [ ] Preparar apresentação: problema → solução → experimento → resultados → limitações → conclusão. Ter evidências e alternativa à demonstração ao vivo.
- [ ] Revisar normas institucionais, concordância com orientador e checklist de entrega.

**Aceite:** cada conclusão empírica aponta para um resultado; cada requisito assumido tem evidência ou limitação registrada.

## 10. Prioridade e controle de escopo

**Obrigatório antes de medir:** ambiente isolado, operação/limites transacionais definidos, integridade/checkpoint, pausa/retomada assumida, timeout/retry seguros, contadores corretos e carga concorrente.

**Obrigatório para entrega científica:** protocolo reproduzível, repetições, métricas de impacto, limitações e redação revisada.

**Adiar salvo necessidade demonstrada:** interface web, API pública completa, Redis/Sidekiq, multi-banco, workers em C, cluster distribuído, replicação, autoajuste de batch, algoritmos avançados de throttling. Essas ideias permanecem trabalhos futuros, não bloqueadores da conclusão.

## 11. Primeiro marco de trabalho recomendado

Começar pelas fases A e B: recuperar o ambiente de teste, confirmar a operação escolhida e escrever o contrato de processamento. Em seguida reproduzir pausa/retomada e checkpoint com testes pequenos antes de investir em dashboards ou carga grande.

Este plano não executou correções, experimentos, publicação no Notion ou alterações no fonte. O próximo passo de implementação exige uma solicitação própria; não executar automaticamente o backlog inteiro.
