# BatCheman — Plano de apresentação pública e organização documental

**Goal:** preparar um repositório compreensível, seguro e reproduzível para compartilhar o BatCheman, separando framework, ferramentas experimentais e histórico do TCC.

**Architecture:** preservar o núcleo transacional existente e revisar sua interface pública antes de prometer uso genérico. Separar documentação de usuário, referência técnica e pesquisa; manter scripts do laboratório fora da experiência principal.

**Tech Stack:** Node.js, TypeScript, Knex, PostgreSQL; Prometheus/Grafana como integração opcional. Não trocar stack, publicar pacote, mover documentos ou alterar código nesta etapa de planejamento.

**Status:** proposta para revisão de Nayan. Somente este plano foi criado. Fases F/G pausadas por prioridade do usuário; resultados do piloto E continuam exploratórios.

---

## 1. Diagnóstico inicial — o que foi observado

- README atual começa como “Framework de processamento em lote — TCC II” e direciona para relatórios de fases, não para um primeiro uso por terceiros. Também há texto antigo sobre observabilidade ainda futura: reconciliar antes de publicar.
- package.json usa `processamento-em-lote-monorepo`, versão 1.0.0, `private:true`, licença declarada ISC, sem entrypoint público `main`/`exports`, declaração de tipos ou `bin`. Não tratar como biblioteca/pacote npm já pronto. Repositório público e pacote npm são decisões diferentes.
- Não foi localizado arquivo LICENSE ou diretório .github na inspeção inicial. Declaração ISC no manifest não substitui confirmar a licença e autoria com Nayan.
- CLI ativa oferece `fixture`, `manual` e `jobs`; `manual` expõe experimentos fixos EXP-06/08/09, dataset e modo A/B, token de check e limite de 1000 registros. Essa é uma interface de review experimental, não uma interface genérica de framework para público externo.
- Job concreto NormalizeSocioNamesJob importa a operação de src/experiments/operations. É preciso avaliar a separação de dependências antes de apresentar arquitetura de produto independente do TCC.
- O contrato TransactionalBatchJob/executeBatch fornece trx, schema/tabela, lo/hi, H e contagens. Já há base técnica para documentação e testes de contrato; não assumir que basta importar a classe para qualquer uso sem instalação/contexto de controle.
- Documentos de A/C/D/E misturam procedimentos atuais, evidências locais, caminhos Windows, limites e instruções superadas; há planos/documentos antigos na raiz e material arquivado.
- `.gitignore` exclui `.env`, build/dependências e resultados experimentais. Auditar separadamente arquivos privados de configuração JSON, segredos do monitoramento, dumps e histórico Git antes de exposição. Nenhum segredo foi lido nesta inspeção.
- Publicação requer dados sintéticos e exemplos neutros, não depender da base da Receita Federal ou dos bancos pessoais de Nayan.

**Conclusão inicial:** existe um protótipo transacional com evidências de funcionamento; ainda é preciso avaliar a experiência de integração por terceiros. A qualidade da apresentação não deve esconder limites atuais.

## 2. Posicionamento e identidade (P1)

### Decisões a fechar

- Nome público exato: **BatCheman** (grafia enviada pelo usuário), versus nomes internos atuais.
- Descrição recomendada: “Protótipo de framework para executar operações DML em lotes transacionais no PostgreSQL, com checkpoint e controle de execução.”
- Usar “framework de processamento em lotes transacionais”, evitando “Transaction Framework” isolado, que pode sugerir um gerenciador geral de transações distribuídas.
- Público inicial: desenvolvedores Node.js/TypeScript que precisam de manutenção/migração de dados com SQL e aceitam commits parciais. Dizer que é originado em TCC e qual estágio de maturidade possui.
- Primeira distribuição recomendada: repositório público clonável, marcado como protótipo experimental. Publicação npm somente se desejada e após contrato/empacotamento próprios.
- Português como documentação principal inicialmente; README curto em inglês pode ser opcional posterior. Não duplicar toda documentação sem capacidade de manter consistência.

### Aceite

Uma pessoa entende em um minuto: o que faz, para quem serve, qual banco suporta, quando NÃO usar e como experimentar.

## 3. Avaliação da aplicabilidade (P2)

Criar tabela “usar / não usar / não suportado” e confirmar pelo código e testes:

**Usos-alvo:** UPDATE, INSERT SELECT e DELETE set-based; transformação determinística; controle de progresso; retomada explícita; operação compatível com commits por lote.

**Não prometer:** atomicidade global do batch, exactly-once genérico, efeitos externos transacionais, suporte a qualquer SQL arbitrário, DDL em lotes, múltiplos bancos, serviço distribuído de filas ou uso irrestrito em produção.

Documentar pré-condições: chave de paginação única/estável, ordenação, H/cursor, uso obrigatório de trx, limites de BIGINT e comportamento de nulos. Coluna processado é específica do exemplo, não exigência geral.

Decidir quais restrições são temporárias do laboratório (nomes de banco/EXP/limite 1000) e quais são contrato do produto. Não apagar guards para parecer genérico; elaborar alternativa segura se a interface pública precisar outros destinos.

**Arquivos futuros:** docs/guide/when-to-use.md e docs/reference/guarantees.md.

## 4. Revisão de usabilidade e API pública (P3)

### Experiência que queremos avaliar

1. Clonar/instalar o projeto.
2. Configurar um banco descartável com exemplo sem segredos.
3. Preparar somente as tabelas de controle exigidas, sem alterar tabelas de domínio implicitamente.
4. Criar um job neutro com uma transformação SQL.
5. Registrar/executar em lotes, consultar progresso e logs.
6. Pausar/retomar/cancelar com significado claro; depois encerrar recursos.

**Meta proposta:** primeiro job em até 10–15 minutos em ambiente já com Node/PostgreSQL, a medir em teste de documentação; não alegar meta já atingida.

### Perguntas técnicas da avaliação

- O uso principal será CLI, integração programática em TypeScript ou ambos? Recomendação: um caminho principal primeiro; como é framework, provar integração por API antes de vender somente scripts fixos de experimento.
- Qual é o módulo público de import? Hoje não há export de pacote definido; inventariar dependências e propor fachada mínima se necessária.
- Quanta configuração o usuário precisa escrever? Diferenciar ajustes essenciais e avançados.
- O job recebe só seu contexto de execução ou precisa conhecer dataset/protocolo/EXP do TCC? Remover acoplamento do uso público de forma incremental, se aprovado, com regressão.
- Registry/CLI jobs deve listar jobs realmente registrados, não apenas nomes de arquivos? Verificar no teste de usabilidade antes de especificar novo comportamento.
- Resume reenfileira e dispatch inicia: escolher apresentação simples, mantendo a distinção correta e compatibilidade quando necessária.
- Falhas devem retornar erro/exit code coerente, com mensagem acionável e sem SQL/credenciais pessoais.

### Fora da interface principal

Baseline monolítico A, carga concorrente, snapshots experimentais, preparação de datasets e análise continuam ferramentas do laboratório. Validação de resultados e restauração permanecem FORA do framework, como decidido. Manter status/completed/failed, guards, checkpoint, logs/errors, rollback e recuperação.

**Arquivos a revisar na implementação posterior:** src/core/TransactionalBatchJob.ts, JobRegistry.ts, JobManager.ts, BatchExecutor.ts, src/cli/index.ts/manual.ts, src/experiments/reviewRunner.ts e package.json. Não renomear tudo nem reorganizar arquitetura só por estética.

## 5. Documentação oficial de usuário (P4)

### README enxuto

- Nome, resumo e estágio de maturidade.
- Problema e exemplo de uso em poucas linhas, sem vender ganho não demonstrado.
- Funcionalidades implementadas e limites principais.
- Requisitos e caminho rápido realmente executável.
- Link para criação de job, comandos/API, configuração e monitoramento opcional.
- Relação com TCC, licença/autoria e contribuição.

Não usar badges de CI/coverage/npm que ainda não existem. Não apresentar tempos do piloto como prova de superioridade.

### Conjunto mínimo de páginas (evitar vinte arquivos pequenos redundantes)

- `docs/README.md`: índice único por público.
- `docs/guide/getting-started.md`: instalação e primeiro job em banco descartável.
- `docs/guide/creating-jobs.md`: SQL parametrizado, trx, intervalos, contagens, nulos e exemplo sem processado.
- `docs/guide/operations.md`: executar/status/pausa/retomada/cancelar/recovery/erros/encerramento.
- `docs/reference/configuration.md`: obrigatórios/defaults/limites/destino e credenciais.
- `docs/reference/guarantees.md`: atomicidade por lote, commits parciais, crash, commit incerto, limites.
- `docs/reference/architecture.md`: diagrama simples de fluxo e responsabilidade dos módulos, sem teoria excessiva.
- `docs/guide/observability.md`: opcional, unidades, custos, ausência de série, segurança do Docker socket.

As páginas podem ser unidas se o conteúdo couber; a estrutura é proposta, não obrigação de gerar volume de texto.

### Exemplos neutros

Criar exemplo sintético genérico, fora dos jobs fixos Receita Federal. Um UPDATE mínimo é o quickstart; INSERT/DELETE são exemplos complementares. Sem base pessoal, nome/documento real, backup grande, restauro automático ou dependência de Grafana para conseguir executar o primeiro job.

Exemplos de assinatura/CLI só serão publicados depois de corresponderem à API realmente implementada.

## 6. Organização dos documentos das fases (P5)

### Árvore proposta

```text
README.md                         # entrada para quem vai usar
STATUS-TCC.md                     # acompanhamento curto da pesquisa
LICENSE                           # após decisão do autor
CONTRIBUTING.md
SECURITY.md
CHANGELOG.md

docs/
  README.md                       # índice por assunto/público
  guide/                          # uso atual
  reference/                      # contrato e arquitetura atuais
  research/
    README.md                     # mapa A–G, escopo e estado
    phases/
      A/                          # preparação/ambiente/evidências históricas
      B/                          # decisões e histórico de desenho
      C/                          # implementação, review e evidências
      D/                          # observabilidade e limites
      E/                          # piloto, guia e resultados exploratórios
    experiments/
      protocol.md                 # protocolo canônico, preservar versões
    evidence/                     # apenas evidências sanitizadas e selecionadas
  archive/                        # documentação obsoleta, identificada

experiments/                      # ferramentas de pesquisa, fora do framework
observability/                    # stack opcional e dashboards
examples/                         # uso público sintético e independente
archive/                          # código legado, sem reativar
```

### Mapeamento preliminar

| Origem atual | Destino proposto |
|---|---|
| docs/PREPARACAO-FASE-A.md, AMBIENTE-FASE-A.md, VALIDACAO-FASE-A.md | docs/research/phases/A/ |
| docs/experiments/protocol.md | docs/research/experiments/protocol.md; manter redirecionamento por arquivo curto ou atualizar consumidores antes de mover |
| docs/VALIDACAO-FASE-C.md, EVIDENCIAS-FASE-C-FINAL.md, REVIEW-FASE-C.md | docs/research/phases/C/ |
| docs/ROTEIRO-MANUAL-FASE-C.md, TESTE-BACKUP-LOCAL.md | docs/research/phases/C/; distinguir receita local histórica de interface pública |
| docs/OBSERVABILIDADE-FASE-D.md | docs/research/phases/D/; guia de uso atual em guide/observability sem duplicar fatos |
| docs/ETAPA-E.md, RESULTADOS-PILOTO-E.md | docs/research/phases/E/ |
| plano inicial na raiz e '# Sistema de Processamento em Lote - Doc.md' | docs/archive/ ou research/phases conforme classificação após leitura integral |
| .hermes/plans/ | planejamento interno, não guia oficial; decidir rastreamento/exposição |
| archive/result-tools/ e archive/legacy-phase-c/ | preservar como histórico explícito, fora da descoberta ativa |

### Regras para mover

- Inventariar e classificar primeiro: atual, evidência histórica, substituído ou ambiente local.
- Arquivos antigos: banner com status e link ao substituto, não apagar fatos para parecer que sempre existiu o modelo novo.
- Atualizar links relativos, README, STATUS, comentários/testes/scripts e quaisquer consumidores dos caminhos.
- Preservar um protocolo canônico; não criar cópias concorrentes nem reabrir A/B aprovado.
- Resultados brutos grandes e backups não entram no Git; selecionar resumo sanitizado e explicar reprodução.
- STATUS deve registrar E encerrada COMO PILOTO por decisão do usuário, separando pendências para campanha F, sem contradizer resultados inconclusivos.
- Não mover tudo em uma mudança irreversível. Gerar inventário antes/depois e validar links.

**Aceite:** usuário encontra primeiro uso e regras sem ler histórico; orientador encontra decisões/evidências por fase sem procurar em arquivos soltos na raiz.

## 7. Segurança, privacidade e licença (P6 — antes de público)

1. Inventariar arquivos rastreados, não rastreados que se pretende incluir e histórico Git. Scan local com saída de localização/tipo redigida, nunca valor de segredo.
2. Verificar .env, configs com senha inline permitida, dumps, CSVs, logs, screenshots, caminhos pessoais e credenciais Grafana/exporters. Não assumir que ignorar hoje remove vazamento antigo.
3. Se segredo histórico for detectado: recomendar rotação; não fazer reescrita de histórico sem aprovação específica. Não publicar até resolver.
4. Exemplos públicos só sintéticos; auditar distribuição/dados pessoais mesmo quando fonte é acessível publicamente.
5. Confirmar licença ISC ou alternativa com Nayan; criar LICENSE correspondente e alinhar manifest. Não escolher direitos do autor por conta própria.
6. README aviso backup/ambiente descartável/commits parciais; SECURITY para reporte privado com contato real a definir, sem endereço inventado.
7. Documentar permissões mínimas PostgreSQL e riscos do cAdvisor/Docker socket. Monitoramento não deve exigir exposição de portas fora do loopback por conveniência.
8. Decidir o que fica público dos históricos locais: sanitizar somente dados pessoais/segredos, preservando evidência metodológica relevante.

## 8. Qualidade e distribuição (P7)

### Repositório público mínimo

- Instalação reproduzível com npm ci, build, unitários e integração em PostgreSQL descartável.
- Teste do quickstart do zero em checkout/worktree limpo e config sintética; não depender de M:/..., container dbpostgres existente ou backup pessoal.
- CI proposto em `.github/workflows/ci.yml` com PostgreSQL efêmero; verificar os nomes/guards atuais de tcc_framework_test em vez de desativá-los para CI.
- Validar links e exemplos da documentação; smoke test de CLI dev/compilada e API pública proposta.
- CONTRIBUTING simples com comandos/estilo/testes; CHANGELOG coerente com versão real e sem inventar releases.
- Issue templates opcionais de bug/pergunta, roadmap curto e limites conhecidos.

### Se for decidido publicar npm

Tratar como entrega separada: nome disponível a consultar, exports/types/bin/files, pacote de runtime sem credenciais/lab/dumps, ts-node somente dev quando aplicável, `npm pack --dry-run`, instalação e execução do tarball em consumidor isolado. Não remover private:true automaticamente. Não fazer npm publish, criar release, tag, push ou tornar repo público sem pedido explícito.

## 9. Ordem prática das entregas

| Entrega | Conteúdo | Aceite |
|---|---|---|
| 1 — Contrato público | Nome/público/maturidade, aplicabilidade, escolha CLI/API e limites | Saber o que será oferecido sem confundir laboratório com produto |
| 2 — Primeiro uso | API/fachada mínima se necessária, config neutra e job sintético | Terceiro executa um job sem precisar do banco pessoal ou de EXP-06 |
| 3 — Documentação oficial | README, primeiros passos, criar job, operações/config/garantias | Comandos/assinaturas realmente exercitados, texto simples |
| 4 — Histórico organizado | Inventário, mapeamento, movimento gradual e índice da pesquisa | Links íntegros e fases encontráveis, nada apagado sem autorização |
| 5 — Pronto para compartilhar | Segurança/licença, CI, reprodução limpa, review independente | Checklist público verde; sem publicação automática |

Em cada alteração de comportamento: teste que falha → ajuste mínimo → teste verde → regressão. Não acoplar redesign completo à escrita de README; se houver divergência entre promessa e implementação, corrigir promessa ou tratar o recurso como nova entrega explícita.

## 10. Decisões de Nayan antes da execução

- Confirmar grafia BatCheman e descrição em português; “Transaction Framework” como termo técnico, não promessa de produto genérico.
- Prioridade de uso: recomendação **API TypeScript com CLI de apoio**, ou CLI como produto principal? Essa escolha muda quickstart e empacotamento.
- Repositório público clonável primeiro (recomendado) ou também pacote npm agora?
- Confirmar licença/autoria; ISC atualmente no manifest, sem licença oficial localizada.
- Aprovar classificação/movimento dos documentos e quais materiais locais não devem ser publicados.

Questões de baixo impacto como nomes de pastas podem seguir o padrão proposto. Nenhuma resposta é necessária para concluir este planejamento; aprovação da execução será tratada separadamente.

## 11. Critério de encerramento desta preparação

- [ ] Nome/posicionamento, interface pública e maturidade claros.
- [ ] Uso principal independente do laboratório experimental e dos bancos pessoais.
- [ ] Primeiro job sintético reproduzido em instalação limpa.
- [ ] README/docs correspondem ao código e declaram limites sem alegar ganho de desempenho.
- [ ] Histórico A–E indexado, sem links quebrados ou fontes de verdade duplicadas.
- [ ] Nenhum segredo/dado pessoal distribuído; histórico auditado ou bloqueios registrados.
- [ ] Licença e contribuição definidas pelo autor.
- [ ] CI/testes/review aprovados para o escopo compartilhado.
- [ ] Divulgação do repositório/pacote somente após autorização específica.

**Não executado neste turno:** reorganização, implementação de API/CLI, scan de segredos, CI, instalação limpa ou publicação. Este documento é o plano baseado na inspeção inicial, não uma certificação de prontidão pública.
