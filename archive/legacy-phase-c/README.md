# Legado arquivado por autorização do usuário

Snapshots do worktree anterior à retirada do caminho item/processItem e CLI implícita. Não importar, compilar, registrar, executar nem validar estes arquivos. Dependências relativas não foram reescritas: material histórico, não pacote executável.

- BatchJob/item, executor/iterator/manager mistos e CLI antiga preservados em src/.
- Modelos anteriores preservados para referência; modelos compartilhados continuam ativos em src/db/models com contexto explícito/guards.
- Testes de caminho legado/CLI global e versão anterior do teste de migrations preservados em tests/; fora dos globs npm.
- Testes ativos substituem escopo legado pelo contrato transacional. Teste de migrations ativo conserva apenas o núcleo, sem certificação do exemplo users.
- SQLs originais permanecem no arquivo já existente experiments/operations, sem alterações. Exemplos históricos em examples/legacy também permanecem inativos.

Nenhum commit/push/reset foi realizado. A autorização arquiva comportamentos legados, não retira manager/registry/modelos nem proteções dos bancos.
