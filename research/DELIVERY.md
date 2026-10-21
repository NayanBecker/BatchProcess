# Entrega técnica — CLI pública simplificada

## Artefato

- `src/cli/index.ts` → `src/cli/public.ts`: `init`, `jobs list`, `register`, `run`, `status`, `logs`, `errors`, `pause`, `resume`, `cancel`, `recover`. Todos por `npm start --`; dev com `npm run dev --`. Ajuda não abre configuração/banco; catálogo não conecta.
- Cadastro separado da execução: pending durável com H/config/target. `--mode monolithic|batch`, `--batch-size`, `--throttle` pertencem ao register; run não altera modo/config, nem em retomada. A/B internos continuam usados pelo mesmo executor.
- Config pública única `batcheman.config.example.json`; local ignorada, passwordEnv explícito. Sem import de .env no caminho público. Configs/entrada de review ficam na pesquisa; `config/backup_testes.json` preservada e ignorada, não foi lida/executada.
- `src/core/runtimeConfig.ts`: confirmação explícita do banco, identificadores <=63 bytes, controle privado/distinto, marcador e owner, colunas/tipos/objetos compatíveis; recusa triggers/regras/herança/FK externas no controle. Public schema permitido para a tabela de domínio declarada, nunca para controle. init reutiliza migrations 001–005 numa transação privada e nunca executa DROP.
- Núcleo original reutilizado. Fixture/clone context mantém restrições antigas, inclusive limite de review. Runtime público usa catálogo declarado sem limite de laboratório/EXP/token; guarda current_database(), alvo durável e posse/checkpoint na mesma conexão permanecem. Suíte histórica preservada.
- `src/jobs/NormalizeLabelJob.ts`: UPDATE sintético parametrizado, sem processado e sem src/experiments. SQL externo opt-in `examples/sql/create-table-and-seed.sql` cria seis linhas; init não prepara domínio. Sem parser SQL arbitrário, validate/restore ou framework novo.

## Execução verificada

Comandos realmente executados neste workspace:

```bash
npm ci
npm run build
npm test
npm run db:check
npm run test:integration
node -r ts-node/register --test --test-concurrency=1 observability/*.test.cjs
npm start -- --help
npm start -- jobs list --config batcheman.config.example.json
```

Resultados finais das suítes completas: **55/55 unitários**, **65/65 integrações** (inclui subtestes Node), **5/5 observabilidade**, sem failures/skips/cancelled/todo. npm ci: 56 pacotes adicionados, 57 auditados, zero vulnerabilidades reportadas. Build exit 0. Antes das integrações db:check confirmou **tcc_framework_test**. A chamada inicial de observabilidade sem ts-node era erro de harness; o comando correto acima passou integralmente. Uma asserção de caminho E antigo foi atualizada após a mudança de pasta.

`tests/integration/public-workflow.test.cjs` exercitou processos **reais dev e dist**, configuração temporária sem segredos em disco, PostgreSQL sintético com guarda de fixture, seed do arquivo documentado (apenas qualificador public substituído pelo schema privado próprio), init idempotente, catálogo, pending/H antes do run, status/logs/errors, recusa de replay e erro SQL persistido. Evidência da rodada:

| id local da fixture | ação | resultado observado |
|---|---|---|
| 1 | monolithic | completed; visited 6; changed 5; 1 commit |
| 2 | batch, size 2 | completed; visited 6; changed 5; 3 commits |
| 3 | pause em processo separado | paused após 1 commit; resume preservou H=13/modo batch; novo run terminou com visited 6/3 commits |
| 4 | cancel em processo separado | cancelled após 1 commit, sem desfazer prefixo |
| 5 | coluna necessária removida externamente na fixture antes de run | failed; zero commits; errorCount 1; um erro durável |

São IDs locais de schemas efêmeros, não instruções para recuperar jobs reais. Dados com NULL/lacunas preservados por oráculo independente no teste. Guards adicionais têm RED observado para controle incompatível, regras de reescrita e campos secretos desconhecidos da configuração e misbinding de contexto/config antes da transação de init. O bug de retorno de QueryBuilder antes do finally/destroy foi corrigido com await e exercitado por logs/errors.

Readback final do catálogo: **zero** schemas `phase_c_test_<32 hex>` remanescentes. Nenhuma execução fora de tcc_framework_test, benchmark ou campanha massiva. Nenhum DROP no runtime público; DROP de schema aparece somente no preparo/cleanup de fixtures com posse e banco confirmado.

Clone local separado do Git com overlay do worktree autorizado foi instalado/compilado do zero em scratch do perfil (`batcheman-clean-3ffa3d6114`): npm ci, build, npm start -- --help e jobs list passaram **sem copiar .env, configs privadas, node_modules ou resultados brutos**. Não foi clone de URL remota nem publicação; o overlay é necessário porque esta entrega está sem commit. O workflow de banco foi exercitado no repo principal em fixtures, não nesse clone sem credenciais.

## Preservação/organização

- `docs/` → `research/docs/`; documentos das fases, protocolo canônico e evidências preservados. Documentação oficial ficou README + src/jobs/README.
- Laboratório `experiments/{phase-e,operations,setup}` → `research/experiments/`; imports/scripts/testes atualizados. Resultados brutos continuam no caminho original ignorado `experiments/results`, sem invalidar manifests absolutos.
- Dois textos antigos da raiz → `research/history/`; STATUS anterior copiado integralmente antes de simplificar a raiz, preservando as alterações locais existentes.
- Conferência programática: **35 arquivos rastreados relocados**, nenhum destino faltante; **11/11 SQLs** com hash igual ao blob Git original após os filtros do repositório.
- Entrada histórica separada `src/research/cli.ts`; fixtures/manual e os jobs históricos continuam compiláveis para regressão, mas não aparecem no npm start público. Wrapper backup-review atualizado para essa entrada, sem operá-lo no backup.
- Observability/mounts/serviços e alteração local inicial de prometheus.yml mantidos; nenhuma troca de DB/restart/porta. Índice único [README da pesquisa](README.md).

## Segurança, limites e aceite

Scan estático do worktree com saída só de path/linha/categoria: padrões de chave privada/token/URI com senha/atribuição password. Candidatos apareceram **somente em literais de testes** (`tests/unit/config.test.cjs`, `migration-safety.test.cjs`, `runtime-config.test.cjs`), não em novos configs de runtime. Não é auditoria completa: .env, configs privadas, resultados grandes e conteúdo do histórico Git não foram lidos/varridos. Check-ignore confirmou a config local pública e config/backup_testes.json ignoradas. Nenhum segredo foi impresso.

Protótipo, não sandbox de jobs nem certificação de produção/backup. Autor precisa conceder permissões SQL mínimas e escolher banco descartável. Mudança de código/catálogo com jobs recuperáveis não é suportada. Logs/errors mostram os 200 mais recentes. Sem retry automático, atomicidade global no batch ou exactly-once para efeitos externos. Perda real de confirmação COMMIT na rede não foi acrescentada como teste; regressões existentes de falha/crash continuam separadas dessas garantias.

`private:true`/ISC preservados; nenhuma licença nova, npm publish, release, commit, push ou reset.

## Aceite final da entrega mínima

Agente principal reexecutou build, db:check, 55 unitários e 65 integrações, todos aprovados, e diff-check sem erro. Revisão independente sem bloqueadores para o fluxo público mínimo pelo repositório; o revisor executou tsc sem emissão, ajuda/catálogo dev/dist e recusa de alteração de modo no run, sem acessar banco ou segredos. Entrega aceita nesse escopo; auditoria do histórico Git/segredos e publicação continuam fora do aceite.

Limite da verificação do controle: owner/marcador, nomes/tipos de colunas e objetos perigosos são conferidos; não é auditoria integral de PK/UNIQUE, NOT NULL, defaults/sequências ou comprimentos. Não alterar manualmente as tabelas de controle após init. Hardening completo do catálogo é melhoria futura, não garantia atual.
