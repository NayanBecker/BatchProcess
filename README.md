# Framework de processamento em lote — TCC II

Comece por [STATUS-TCC.md](STATUS-TCC.md). Review atual: [REVIEW-FASE-C.md](docs/REVIEW-FASE-C.md).

## Caminho ativo

- Núcleo set-based transacional A/B com checkpoint junto do DML, posse de sessão e recuperação explícita.
- Jobs disponíveis: NormalizeSocioNamesJob (EXP-06), CopySociosJob (EXP-08), DeleteMigratedJob (EXP-09).
- Fixtures: exclusivamente tcc_framework_test/schema isolado. Manual: **clone LOCAL próprio**, config separada; postgres e tcc_framework_test proibidos no modo manual. backup_testes só admite o opt-in estrito de [TESTE-BACKUP-LOCAL.md](docs/TESTE-BACKUP-LOCAL.md).
- [Roteiro manual completo](docs/ROTEIRO-MANUAL-FASE-C.md), [config sem segredos/em aberto](config/clone.example.json), [evidências](docs/EVIDENCIAS-FASE-C-FINAL.md).
- [Protocolo v3](docs/experiments/protocol.md) é desenho metodológico; [SQLs originais](experiments/operations/README.md) permanecem arquivados/inalterados, não são comandos para executar indiscriminadamente.

## Verificação local, sem benchmark

Node.js >=22.22.2 e dependências já instaladas. Configuração global existente é somente das fixtures; não redirecioná-la ao clone.

```bash
npm run build
npm test
npm run db:check
npm run test:integration
npm start -- jobs
npm start -- fixture --help
npm start -- manual --help
```

A CLI legada start/list/status/logs sem destino e o caminho item/processItem foram arquivados por autorização. Use fixture/manual com target explícito; resume apenas reenfileira, dispatch executa. Review manual é pequeno/controlado, não campanha massiva. Não houve benchmark nem certificação de backup real; instrumentação/visualização são próximas fases.

## Histórico

`validate` de resultados/dados e `restore` foram retirados da implementação, CLI/API de review e build; o wrapper também os recusa antes de carregar configuração/conexão. [Arquivo histórico](archive/result-tools/README.md), sem substituto externo executável. Snapshots de preparo/token e histórico existentes preservados; helpers sintéticos apenas em tests/helpers, fora de dist. Cada nova rodada A/B usa conjunto inicial isolado, sem reset implícito.

**Permanecem no framework:** verificar conclusão/falha do job, status/completed/failed, error_count, logs/errors, detecção SQL/checkpoint, preconditions/validateInitial, guards de entrada/destino, rollback e recovery. `completed` não é certificado de integridade dos dados. Comparações independentes de resultados continuam nas suítes com assertions/SQL de teste.

[Preparação Fase A](docs/PREPARACAO-FASE-A.md), [ambiente](docs/AMBIENTE-FASE-A.md) e [validação A](docs/VALIDACAO-FASE-A.md) preservam evidências históricas, não instruções da CLI atual. Exemplos em examples/legacy e snapshots em archive/legacy-phase-c não são compilados/executados/testados. Não execute migrations em public para preparar review do clone; prepare instala somente controle privado com guards. Nada foi feito com npm migrate nesta entrega.
