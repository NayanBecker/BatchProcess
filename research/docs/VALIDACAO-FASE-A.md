> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Validação da Fase A — resultados observados

**Encerramento técnico: 30/09/2026 (UTC−03:00)**; evidências JSON usam UTC e, portanto, aparecem como 01/10/2026 após 21h locais. Escopo: preparação, instalação e consultas básicas; não validação experimental do framework.

## Situação das oito pendências

| Item | Resultado verificado |
|---|---|
| 1. Configuração unificada | `databaseConfig()` compartilhada; runtime e migrations consultaram `current_database()` e retornaram `tcc_framework_test`. Credenciais fixas retiradas do fonte ativo. |
| 2. Arquivos de configuração | `.env.example` sem senha, `.env` local configurado e ignorado, `src/.env` preservado localmente e removido do índice. Precedência/carregamento documentados. |
| 3. Instalação/build | `npm ci` e `npm run build` concluídos; lockfile alinhado ao nome/engines do pacote; atualização transitiva de lodash. |
| 4. Migrations | Quatro migrations do núcleo criadas, revertidas, reaplicadas; segunda aplicação sem pendências. Dois rollbacks defeituosos reproduzidos e corrigidos. |
| 5. Exemplos separados | `Add_ContactTablejob.ts` e migration `users` movidos para `examples/legacy`; fora do build e do carregamento ativo. |
| 6. CLI | Ajuda/catalogo dev e compilado; list/status/logs vazios; fechamento do pool; rejeição de ID malformado e job não registrado antes de abrir banco/worker. |
| 7. Documentação | README, guia de preparação, inventário e evidências locais. O diário Notion é a síntese de acompanhamento, não substitui este guia. |
| 8. Ambiente | CPU/RAM/OS, versões, recursos Docker, imagem/digest, volumes e descoberta limitada de observabilidade registrados em `AMBIENTE-FASE-A.md`. |

## Comandos realmente executados

| Comando/validação | Resultado |
|---|---|
| `npm ci` | Saída 0, 56 pacotes instalados, 57 auditados na execução registrada. |
| `npm run build` | Saída 0; limpa `dist/` antes de compilar. |
| `npm test` | **14 testes aprovados**, zero falhas, cancelamentos ou pulos. |
| `npm run test:integration` | **8 testes aprovados**, zero falhas, cancelamentos ou pulos. |
| `npm run db:check` | Destino real confirmado: `tcc_framework_test`, usuário `postgres`. |
| `npm run migrate` | Quatro migrations; chamada após reaplicação informou zero migrations. |
| `npm run migrate:rollback -- --confirm=tcc_framework_test` | Quatro migrations revertidas; tabelas de controle permaneceram. |
| `npm run dev -- --help` / `npm start -- --help` | Saída 0; ajuda. |
| `npm run dev -- jobs` / `npm start -- jobs` | Saída 0; nenhum job ativo encontrado. |
| `list`, `status 1`, `logs 1`, dev e compilado | Saída 0; mensagens coerentes de ausência; encerramento dentro do limite de teste. |
| `npm audit` | Zero vulnerabilidades reportadas na verificação final. |
| `npm ls --depth=0` / `npm ls lodash` | Dependências resolvidas; lodash 4.18.1. |

Total: **22 testes automatizados aprovados**. O ciclo destrutivo completo pelo runner foi uma validação adicional e não está incluído nessa contagem. Não foram medidos p95/p99, throughput experimental ou disponibilidade sob carga.

Saídas reais, comandos e instantes: [validacao-final.json](evidencias/validacao-final.json). Ciclo completo: [migrations-cycle.txt](evidencias/migrations-cycle.txt). Não são saídas simuladas.

## Defeitos reproduzidos e correções

1. **Configuração divergente:** teste inicial encontrou `postgres` no runtime quando o ambiente solicitava outro banco. Ambos os caminhos passaram a usar o módulo comum. Testes cobrem precedência de env, arquivo explícito com mudança de cwd, campos obrigatórios, porta e pool.
2. **Imports na CLI:** `npm run dev -- --help` retornava `Cannot find module '../core/JobRegistry.js'`. Imports compatíveis com a emissão CommonJS/ts-node foram ajustados e o gerenciador é carregado apenas quando necessário.
3. **Rollback parcial:** `004_add_job_metadata.down` deixava `started_at`, `completed_at`, `error_count`. O teste comparou colunas antes/depois e a correção reverte todos os campos adicionados.
4. **Rollback de exemplo:** após remover `users`, o código tentava criar índice nessa tabela, gerando `relation "users" does not exist`. O trecho foi removido; `up/down/up` passou em schema isolado dentro de transação revertida.
5. **Exemplos/artefatos antigos:** o catálogo listava `Add_ContactTablejob`; `dist` conservava esse job, NormalizeUserEmailsJob e a migration users. Exemplos foram movidos e build passou a limpar somente o diretório gerado.
6. **Encerramento da CLI:** o teste de `list` excedeu seu timeout com o pool aberto. Comandos finitos agora destroem o pool ao concluir.
7. **Segurança das migrations:** scripts npm passam pelo executor que recusa outro banco e exige confirmação de rollback. Destino real é consultado antes da DDL. Testes de rejeição usam configuração fictícia e não precisam conectar.
8. **Dependência transitiva:** audit inicial reportou uma vulnerabilidade de severidade alta agregada em lodash 4.17.23. `npm update lodash --package-lock-only --ignore-scripts` atualizou para 4.18.1, seguido de `npm ci` e `npm audit` sem alertas. Dependências diretas mantiveram suas versões instaladas.

Revisão independente do diff/arquivos novos não apontou bloqueios de segurança/lógica e o typecheck passou. Sugestões não bloqueantes incluíram automatizar permanentemente o ciclo completo pelo runner e expandir testes offline da CLI compilada; o ciclo real e os comandos compilados foram exercitados nesta entrega. Nenhum commit/push foi feito.

## Estado dos bancos ao final

Conferência em `2026-10-01T00:22:14.558561+00:00`:

- `tcc_framework_test`: `batch_jobs`, `batch_job_errors`, `batch_job_logs`, `knex_migrations`, `knex_migrations_lock`.
- Histórico: quatro migrations do núcleo. Execuções, logs e erros: **zero registros**.
- `users`/`contacts_user` não existem no schema público preparado. O teste de reversibilidade de `users` não deixou a tabela persistida.
- Hash canônico do schema do banco original `postgres` permaneceu idêntico antes/depois. Foram removidos comentários e nonces de `pg_dump` antes da comparação.
- Não foi executada escrita no banco original; **não foi auditado o conteúdo de todas as suas linhas**. Igualdade de schema não prova igualdade de dados.

Evidências: [schema-original-antes.json](evidencias/schema-original-antes.json) e [estado-final-bancos.json](evidencias/estado-final-bancos.json).

## Ocorrências e limitações

- Durante a coleta de evidências, uma chamada de terminal encapsulada retornou `-1` sem saída para `npm run dev -- jobs`. A cadeia parou em vez de mascarar o retorno. A mesma sequência foi repetida pelo terminal direto e pelo coletor, ambas com saída 0; o registro anterior foi preservado no JSON. Não foi determinada a causa desse retorno da ferramenta, nem tratado como falha confirmada da aplicação.
- A exclusão preexistente de `src/Jobs_Dones/NormalizeUserEmailsJob.ts` e o arquivo local de planejamento foram preservados. `git rm --cached` afetou apenas `src/.env` e arquivos gerados de `dist`, sem apagar a configuração local. A árvore não está limpa; as mudanças estão disponíveis para revisão/commit pelo autor.
- Senhas não foram incluídas nos arquivos novos versionáveis nem nas evidências. Segredos em commits antigos não são removidos por essa limpeza; rotação permanece recomendada, sem alteração automática de credenciais.
- Host: i5-7300HQ, 4 núcleos/4 threads, 16 GiB instalados. Linux Docker: 4 CPUs e 7,696 GiB compartilhados. `dbpostgres` não tem quota própria de CPU/memória configurada. O ambiente não é isolado para benchmarks; `hermes-api` também estava ativo.
- Não foram identificados Prometheus/Grafana/exporters nos containers, processos e portas inspecionados; não é prova de ausência em outras máquinas/contextos/portas. Nenhum serviço de observabilidade foi instalado.
- `start`, pausa/retomada de jobs reais, checkpoints, retries, cancelamento de timeout e concorrência continuam sem validação funcional nesta fase. A antiga implementação do núcleo não foi reescrita.

## Próxima etapa

Definir a operação experimental e seus limites transacionais (Fase B), seguida dos ajustes e testes de confiabilidade (Fase C). Somente então instrumentar, gerar carga concorrente e comparar monolítico/batch sob condições equivalentes e múltiplas repetições.
