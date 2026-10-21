# Pesquisa e laboratório — histórico A–E

O uso público está no [README principal](../README.md). Estes materiais registram o TCC, decisões/evidências anteriores e procedimentos específicos de laboratório; não são pré-requisitos do BatCheman.

| Fase | Registro preservado |
|---|---|
| A — preparação/ambiente | [preparação](docs/PREPARACAO-FASE-A.md), [ambiente](docs/AMBIENTE-FASE-A.md), [validação](docs/VALIDACAO-FASE-A.md), [evidências brutas](docs/evidencias/) |
| B — desenho metodológico | [protocolo canônico v3](docs/experiments/protocol.md), [plano histórico](../.hermes/plans/2026-10-02_100058-fase-b-protocolo-proposto.md) |
| C — núcleo transacional/review | [review](docs/REVIEW-FASE-C.md), [validação histórica](docs/VALIDACAO-FASE-C.md), [evidências finais históricas](docs/EVIDENCIAS-FASE-C-FINAL.md), [manual antigo](docs/ROTEIRO-MANUAL-FASE-C.md), [backup antigo](docs/TESTE-BACKUP-LOCAL.md) |
| D — observabilidade opcional | [relatório/limitações](docs/OBSERVABILIDADE-FASE-D.md), [stack e collector](../observability/) |
| E — piloto exploratório encerrado | [procedimento](docs/ETAPA-E.md), [resultados e limitações](docs/RESULTADOS-PILOTO-E.md), [scripts de laboratório](experiments/phase-e/) |

E é piloto pequeno, **não** campanha completa nem prova de superioridade; F/campanha ampla e certificação de backup não foram realizadas nesta simplificação.

## Organização e compatibilidade

- `docs/` foi movido integralmente para `research/docs/`, incluindo protocolo e evidências. Não existem dois protocolos concorrentes. Os documentos de fases têm aviso de escopo e links atualizados.
- SQLs originais, manifests e preparação foram movidos sem alterar o SQL para [experiments/operations](experiments/operations/) e [experiments/setup](experiments/setup/). Scripts E estão em [experiments/phase-e](experiments/phase-e/), fora do caminho público.
- Resultados locais grandes continuam **no caminho original ignorado** `../experiments/results/`: não foram apagados, reescritos nem movidos, preservando resultDirectory/checksums de manifests antigos. Não são distribuição pública automática.
- [Estado detalhado pré-simplificação](history/STATUS-before-public-cli.md) preserva inclusive alterações locais anteriores; [outros documentos antigos](history/) continuam históricos. Planos internos em `.hermes/plans/` não são guia do usuário nem licença para executar.
- [Legado item/processItem](../archive/legacy-phase-c/) e [ferramentas de resultado retiradas](../archive/result-tools/) seguem arquivados. validate/restore não voltaram ao runtime.
- Fixtures/review antigos têm entrada técnica separada `src/research/cli.ts` / `dist/research/cli.js`, para regressão. `npm start` e `npm run dev` **não despacham** fixture/manual/EXP. Helpers e testes de segurança permanecem ativos; limites de review/1000 continuam nesse caminho, não no runner público.
- `src/experiments/`, os três jobs históricos e `src/cli/fixture.ts`/`manual.ts` permanecem como suporte à regressão de pesquisa; não são importados obrigatoriamente pela CLI pública. Não foram reescritos como um segundo framework.
- [Observability](../observability/) é opcional. Sua pasta/config/mounts e a alteração local preexistente em prometheus.yml foram deliberadamente mantidos onde estavam para não quebrar a stack em execução. Não houve restart de serviços, troca de banco, novas credenciais ou publicação de portas nesta entrega. Configurações de pesquisa não apontam automaticamente para jobs públicos.
- `scripts/backup-review.cjs` continua ferramenta histórica, com entrypoint atualizado para a CLI de pesquisa, sem execução no backup. Não é parte do primeiro uso.

[Relatório técnico desta entrega](DELIVERY.md). As contagens nos relatórios de fase são históricas; consulte DELIVERY para a regressão atual. Sem benchmark, release, commit/push ou nova decisão de licença.
