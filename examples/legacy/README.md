# Exemplos históricos — não ativos

Arquivos mantidos como referência; fora do build e do carregamento automático da CLI.

- `jobs/Add_ContactTablejob.ts`: atualiza `contacts_user`, tabela que NÃO é criada pelas migrations do núcleo. Não executar como validação da Fase A.
- `migrations/002_create_users.ts`: exemplo de tabela de domínio; não faz parte de `npm run migrate`. O rollback foi corrigido e testado isoladamente, sem popular dados.
- A exclusão já existente de `src/Jobs_Dones/NormalizeUserEmailsJob.ts` foi preservada. O histórico Git continua sendo a referência para esse exemplo.

**Banco antigo:** retirar `002_create_users.ts` da pasta ativa altera o conjunto de migrations. Um banco que já tenha esse nome no histórico precisa de avaliação/migração específica. Não use estes comandos para atualizar ou reverter o banco original; não apague registros de `knex_migrations` para contornar a divergência. A preparação da Fase A usa exclusivamente o banco novo `tcc_framework_test`.

Os jobs experimentais serão definidos após os ajustes do framework; esta separação não valida processamento, retomada, retry ou checkpoints.
