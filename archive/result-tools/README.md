# Histórico superado — ferramentas de resultados retiradas

Fora da aplicação, compilação e glob de testes. Não executar os comandos nos roteiros históricos.

- review-actions.ts.txt: trechos de comparação de resultados e reset retirados de reviewRunner; referência textual sem entrypoint executável.
- TESTE-BACKUP-LOCAL.historical.md e ROTEIRO-MANUAL-FASE-C.historical.md: roteiros/evidências anteriores preservados integralmente, SUPERADOS pelos arquivos atuais em docs/.
- O antigo src/experiments/restore.ts foi movido para tests/helpers/fixture-artifact.ts, exclusivamente para criação/inspeção de fixtures sintéticas tcc_framework_test; não integra dist nem API do framework.

Não há ferramenta externa executável de validate/restore oferecida nesta entrega. Nenhum dado, snapshot, checkpoint ou histórico de banco foi apagado. Estado completed/failed, contadores, logs/errors e guards operacionais permanecem ativos; completed não certifica resultado de domínio.
