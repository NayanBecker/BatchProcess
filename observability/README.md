# Banco e jobs no Grafana

Abra **http://localhost:3000/d/tcc-phase-d** (login local existente). O painel **BatCheman — Banco e jobs** mantém o UID antigo e foi definido como início da organização local.

São 11 painéis: saúde do PostgreSQL e da leitura dos jobs, conexões, locks, transações/s, CPU e memória somente do container `dbpostgres`, tabela dos jobs, barras de visitados por execução, linhas de execução por data/hora e consultas atuais. Atualização da tela: **30s**; scrape: **15s**; janela inicial: **1h** (o painel de execução usa **7 dias**); até **600 pontos** por painel. O alvo de carga experimental em 9465 não é mais coletado.

## Coletor read-only

Para operação contínua, depois de `npm run build`, execute na raiz do repositório:

```bash
node observability/run.cjs collector-up
node observability/run.cjs ps
```

`collector-up` constrói e inicia **somente o coletor**, sem recriar Grafana, Prometheus ou PostgreSQL. O serviço Docker usa `restart: unless-stopped`, independente do terminal/Hermes; precisa do Docker Desktop ativo. Parar explicitamente o container impede o reinício automático até iniciá-lo novamente. O healthcheck verifica a leitura real do banco; falhas de leitura retornam 503 e voltam a ser tentadas nos próximos scrapes (Docker não reinicia um container somente por estar unhealthy).

A imagem Node 22.22.2 instala somente dependências de produção do lockfile, sem compilação TypeScript em runtime; inclui apenas os arquivos explícitos do coletor e helpers compilados. O contexto de build usa allowlist e não envia `.env`, configuração local nem senha do Grafana. Roda como `node`, com filesystem da imagem somente leitura, até 128 MiB/0,25 CPU e porta publicada apenas em `127.0.0.1:9464`. O bind interno `0.0.0.0` é restrito ao container/rede Docker. O alvo Prometheus existente `host.docker.internal:9464` é mantido.

O serviço monta `batcheman.config.local.json` e `.env` da raiz como arquivos **somente leitura** em `/run/batcheman/`; não copia segredos para a imagem nem passa senha no comando/ambiente Docker. Usa `readRuntimeConfig` e `readRuntimePassword`, os mesmos helpers da CLI. No container, a senha vem da chave `passwordEnv` no `.env` montado; variáveis do terminal do host **não são propagadas** para ele. O wrapper mantém seu loader de credenciais já existente somente para interpolar o Compose dos outros serviços. A conexão e `target.controlSchema` continuam os do JSON local; somente hosts loopback (`localhost`, `127.0.0.1`, `::1`) são adaptados em memória para `host.docker.internal` quando `BATCHEMAN_COLLECTOR_CONTAINER=1`. Hosts remotos e o JSON no host não são alterados.

Para diagnóstico nativo com configuração alternativa, sem serviço Docker (não usar simultaneamente na mesma porta):

```bash
node observability/run.cjs collector batcheman.config.local.json
```

Esse modo permanece ligado ao terminal, preserva o bind de `collector.config.json` e aceita senha do ambiente antes do fallback para `.env` ao lado da configuração. Nunca imprima senha, ambiente, SQL ou configuração completa. `/health` em `http://127.0.0.1:9464/health` retorna 503 se a leitura falhar. Após alterar os arquivos compilados ou o coletor, repita `collector-up` para reconstruir a imagem.

Uma conexão, transação `READ ONLY`, timeout de 3s, no máximo 200 registros do controle por consulta. A ordenação prioriza `running`, depois `pending`/`paused`, depois IDs recentes; os detalhes individuais são limitados a 20 jobs. Nomes válidos seguem o catálogo da CLI (até 100 caracteres, letras/números/`_`/`-`). Não há SQL, hash, dataset nem credencial em labels. O snapshot SQL não é transferido na consulta.

`batcheman_job_*` mostra ID, nome, estado e modo; visitados, alterados, commits e erros são contagens duráveis no último commit. **Não** é percentual pelo cursor nem taxa de processamento. `running` é estado persistido, não prova heartbeat do worker. O painel 9 usa uma consulta instantânea e uma barra por nome/ID da execução, sem somar os scrapes ao longo do tempo.

O painel 10, **Execução dos jobs — início e fim**, mostra uma linha por ID, com dois extremos: zero no horário `started_at` e tempo decorrido no horário `completed_at`. O eixo horizontal é data/hora, o vertical é duração, e a legenda mostra o valor final. A linha intermediária representa tempo decorrido, não amostragem de trabalho ativo: inclui pausas, throttle e eventuais períodos sem executor. Jobs `running` têm o segundo extremo no instante da consulta, sem salvar uma finalização; pendentes não aparecem. Mostra até 20 execuções, prioriza as em execução e usa visualização de sete dias para incluir os jobs já encerrados; datas seguem o fuso do dashboard. Se o schema de controle mudar, ajuste `job-timing-panel.cjs` além dos filtros e datasource. A métrica de tempo médio continua disponível no coletor, mas não ocupa mais esse painel.

O painel 8, **Jobs — estado e progresso confirmado**, consulta o controle diretamente e retorna um único conjunto de dados: uma linha por job, com ID, nome, estado, modo, visitados, alterados, commits e erros. Mostra os 200 IDs mais recentes em ordem numérica decrescente, sem priorizar os que estão em execução, sem paginação e sem seletor de métricas/tabelas. Os cabeçalhos permitem filtrar. Não depende da janela dos gráficos; nulos permanecem `—`, sem inventar contagens zero. Se o controle mudar, ajuste também `jobs-status-panel.cjs`.

As métricas `tcc_*` existentes continuam compatíveis, mas agora somam **somente a seleção limitada a 200 jobs**, não todo o histórico. Podem cair quando a seleção muda ou o histórico é excluído; não aplicar `rate` a esses gauges. Transações/s usa os contadores reais do PostgreSQL. Locks mede quantidade, não espera. CPU/memória vêm do cAdvisor da VM Linux, não do Windows.

O dashboard está configurado para `backup_testes` e container `dbpostgres`; se o destino mudar, ajuste os filtros em `dashboard.cjs` e regenere com `node observability/dashboard.cjs`. Fonte e JSON gerado devem ficar sincronizados. O provisioning verifica arquivos a cada 30s (polling adequado a bind mounts do Docker Desktop), sem reiniciar o banco. O painel experimental Fase E foi retirado do provisioning após backup externo; dashboards criados pelo usuário não são afetados.

## Consultas atuais e espera por lock (painel 11)

A tabela no final consulta diretamente o PostgreSQL via datasource `batcheman-postgres`; **texto SQL não é exportado nem retido no Prometheus**. Mostra o **Top 10 por data/hora de início da consulta, da mais recente para a mais antiga**, em `current_database()`. Inclui a coluna de início e mantém estado, duração, transação, bloqueadores e SQL na mesma lista. Idle normal, coletor e conexões Grafana são excluídos. Não depende da janela histórica da tela: é somente o instante atual, atualizado a cada 30s; consultas mais curtas podem passar despercebidas. Não guarda histórico de consultas concluídas; locks antigos podem ficar fora do Top 10.

Exibe PID, aplicação, estado, execução da consulta **somente quando active**, idade da transação, tipo/evento de espera, quantidade/PIDs dos bloqueadores e SQL truncado a 500 caracteres. Em transação ociosa o texto é a **última consulta**, não uma consulta ainda executando. `Espera lock (s)` usa `pg_locks.waitstart` dos locks não concedidos (PostgreSQL 14+); nulo significa indisponível, não zero. IO e outros eventos não são apresentados como lock; possuir locks concedidos não significa estar bloqueado. Os bloqueadores listados vêm de `pg_blocking_pids`, inclusive sessões fora da seleção. Não há contagem parcial de sessões bloqueadas pelo PID.

Tabela vazia/“No data” sem erro de consulta é válida quando não existem sessões elegíveis; erro de conexão deve ser tratado separadamente. O SQL está truncado, **não anonimizado**, e pode conter literais/dados sensíveis. Somente usuários locais autenticados e autorizados devem ter acesso. Não salve respostas, screenshots com consultas reais ou dumps como evidência no repositório.

Para reproduzir a configuração, após gerar o dashboard e compilar a CLI:

```bash
node observability/dashboard.cjs
node observability/configure-grafana-activity.cjs batcheman.config.local.json --use-existing-role
```

O script usa os mesmos helpers de configuração/senha da CLI, verifica a identidade por SELECT, configura a senha somente em memória via API local (`secureJsonData`, criptografada pelo Grafana), recarrega o provisioning e lê o resultado aplicado. Pool: uma conexão aberta/ociosa, vida máxima 60s. Loopback do host é convertido para `host.docker.internal` dentro do container. Não altera o datasource Prometheus padrão. Não cria roles, muda senhas, concede permissões, reinicia serviços nem executa jobs.

**Limite de segurança:** a instalação atual reutiliza a conta existente `postgres`. O SELECT deste painel não torna a conta somente leitura: usuários com acesso ao datasource podem enviar outros comandos SQL com os privilégios dessa conta. `editable:false` não impede isso. O flag exige reconhecimento explícito desse risco. Para uso compartilhado/produção, é recomendado um usuário dedicado com permissões mínimas de monitoramento (`pg_read_all_stats` ou equivalente aprovado), sem privilégios de escrita; criação/grants exigem autorização separada. Nenhuma alteração de privilégios foi feita aqui. A configuração de conexão atual é local sem TLS; não a reutilize para rede não confiável.

## Verificação sem escrever no banco

```bash
node --test observability/collector.test.cjs observability/collector-runtime.test.cjs observability/collector-service.test.cjs observability/targets.test.cjs observability/dashboard.test.cjs observability/grafana-activity.test.cjs
```

Não use o glob `observability/*.test.cjs` para uma verificação somente leitura: `fixture.test.cjs` exige `tcc_framework_test` e cria/altera dados sintéticos.

`node observability/run.cjs ps` consulta os serviços Docker. `up`/`down` modificam serviços e exigem decisão do operador; o wrapper Docker conserva seu loader local de credenciais do exporter. Não use `down -v`, remova volumes nem reinicie o banco para ajustar o dashboard. `observability/local/` contém material privado e não deve ser versionado ou copiado para relatórios.
