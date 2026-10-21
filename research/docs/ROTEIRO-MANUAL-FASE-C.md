> Documento histórico/de pesquisa; comandos do laboratório não são o fluxo público atual. [BatCheman: primeiro uso](../../README.md).

# Review manual — comandos ativos

Ferramentas `validate` de resultados/dados e `restore` **retiradas**, não apenas ocultadas. O [roteiro anterior](../../archive/result-tools/ROTEIRO-MANUAL-FASE-C.historical.md) é histórico superado; não execute seus comandos removidos. Não há substituto externo executável.

## Configuração e limites

Clone LOCAL explícito, config separada, allowlist e confirmação exata DB/DATA_SCHEMA/CONTROL_SCHEMA; máximo 1000 linhas por tabela. Não alterar .env, usar postgres ou origem. tcc_framework_test é exclusivo de fixtures e proibido na CLI manual. backup_testes requer a exceção estrita já documentada em [TESTE-BACKUP-LOCAL.md](TESTE-BACKUP-LOCAL.md).

Preencha research/config/clone.example.json em arquivo privado. Credencial só pela variável explicitamente nomeada em connection.passwordEnv; não gravar senha na config/chat. Não executar migrations globais em public.

Tabelas privadas controladas: teste_socios(id BIGINT PK, nome TEXT, nome_normalizado TEXT, documento TEXT, processado BOOLEAN); teste_destino(id BIGINT PK, nome TEXT, documento TEXT); teste_migracao(id BIGINT PK, uf TEXT, migrado BOOLEAN). IDs positivos, até 1000 linhas, sem colunas extras, triggers/RLS/regras/herança/FK. Inicialmente processado/migrado FALSE, nome_normalizado NULL e destino vazio. Operador prepara o conjunto inicial fora do framework.

## Sequência para UM conjunto inicial novo

Substitua os placeholders; run/prepare/mark são escritas explícitas, somente no clone autorizado.

```bash
npm run build
CFG='C:/CAMINHO/PRIVADO/clone.json'
TARGET='SEU_CLONE/SEU_DATA_SCHEMA/SEU_CONTROL_SCHEMA'
OP='EXP-06'
DATASET='review-unico-v1'
npm start -- manual check-config --config "$CFG" --confirm "$TARGET"
npm start -- manual check --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
TOKEN='CHECK_TOKEN_RETORNADO'
npm start -- manual prepare --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --check-token "$TOKEN"
# EXP-09: novo check e manual mark com esse token antes do run.
# Sempre repetir check e copiar token atual antes de run:
npm start -- manual check --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
TOKEN='CHECK_TOKEN_ATUAL'
npm start -- manual run --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --mode B --check-token "$TOKEN" --batch-size 2
```

Modo A também permanece. Cada execução nova A/B precisa de conjunto inicial isolado; trocar apenas dataset não reseta dados. prepare mantém snapshot/checksum para admissão e recusa sobrescrever snapshot. check é preflight/token, **não validação de resultado final**. mark é preparação EXP-09, não DML medido. Nenhum reset implícito; snapshots não são ferramenta de backup.

## Estado, erros e recuperação preservados

```bash
ID='ID_REAL_RETORNADO'
npm start -- manual list --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
npm start -- manual status --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
npm start -- manual logs --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
npm start -- manual errors --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
```

status/completed/failed, error_count, logs/errors e detecção de falhas SQL/checkpoint fazem parte do framework. `completed` é conclusão operacional, **não integridade de dados certificada**. Preconditions/validateInitial, guards de parâmetros/destino, rollback, checkpoint e vínculo durável permanecem obrigatórios. Assertions/SQL independentes de resultados continuam nos testes.

pause/cancel são pedidos cooperativos; aguarde estado confirmado. resume/recover somente reenfileiram; dispatch executa. Use os mesmos flags acima e ID. Recovery é explícito após investigar causa e posse; nunca restaurar/alterar dados/checkpoints para retomar. Não apagar histórico para destravar. SIGINT/SIGTERM aguardam lote; sinal Windows nativo não certificado.

Sem benchmark, mutação de backup/postgres ou certificação de backup nesta retirada.
