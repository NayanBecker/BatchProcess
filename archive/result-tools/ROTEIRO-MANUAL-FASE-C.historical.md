# Roteiro manual — review Fase C em clone LOCAL

> **SUPERSEDED / HISTÓRICO SUPERADO.** Não executar comandos deste arquivo. validate de resultados e restore foram retirados. Use docs/ROTEIRO-MANUAL-FASE-C.md atual; credencial por passwordEnv, não senha inline.

**Roteiro genérico original, não executado.** A autorização posterior para o backup Docker descartável foi implementada e exercitada em [TESTE-BACKUP-LOCAL.md](TESTE-BACKUP-LOCAL.md). `postgres`, `tcc_framework_test` no modo manual e a origem continuam proibidos. `backup_testes` só admite o opt-in estrito no destino privado fixo documentado. Este runner é review controlado pequeno, **até 1000 linhas**, não benchmark/campanha. Nenhuma cópia integral é feita. Não aumente/remova o guard.

## 1. Configurar depois, sem redirecionar .env

Copie `config/clone.example.json` para arquivo privado fora do Git e complete **por conta própria** host/port/database/user e schemas. O exemplo é propositalmente inválido (port null e strings vazias). Não mande senha em chat nem a grave em docs/Git. Em autenticação local que necessite senha, o arquivo privado pode conter `connection.password`; em autenticação sem senha pode omitir. Manual não usa `.env`/PGPASSWORD como fallback para senha.

- `connection.database` e `target.database`: nome exato do seu clone local, nunca um banco proibido.
- `target.dataSchema` e `target.controlSchema`: identificadores privados minúsculos, diferentes, não public/pg_*/information_schema/phase_c_test_*.
- `target.tables`: manter exatamente teste_socios/teste_destino/teste_migracao.
- `customSchemas: true`: opt-in explícito depois de revisar os schemas.
- `allowlist`: adicionar a string exata `DB/DATA_SCHEMA/CONTROL_SCHEMA`.
- `maxRows`: de 1 a 1000. Não é mecanismo para liberar 17 milhões.

Use variáveis Bash, **substituindo você os placeholders**:

```bash
CFG='C:/CAMINHO/PRIVADO/clone.json'
TARGET='SEU_CLONE/SEU_DATA_SCHEMA/SEU_CONTROL_SCHEMA'
OP='EXP-06'
DATASET='review-exp06-v1'
npm run build
npm start -- manual check-config --config "$CFG" --confirm "$TARGET"
```

`check-config` valida sem abrir conexão. Se houver campos faltantes, allowlist/confirm divergente, schema não autorizado ou banco proibido, deve retornar exit 1. A CLI não descobre hosts/credenciais e não cria clone.

## 2. Preparar dados pequenos pelo operador

Em **seu clone local e schema privado**, prepare tabelas controladas pequenas, sintéticas ou um recorte explicitamente escolhido por você. Não copie a tabela integral nem a origem com o runner. Não aplique `npm run migrate` em public para isso.

Formato aceito (TEXT ou VARCHAR para textos; IDs BIGINT PK/UNIQUE NOT NULL positivos):

```text
teste_socios(id bigint PK, nome text NULL, nome_normalizado text NULL,
             documento text NULL, processado boolean)
teste_destino(id bigint PK, nome text NULL, documento text NULL)
teste_migracao(id bigint PK, uf text NULL, migrado boolean)
```

Sem colunas adicionais, RLS, triggers, regras, herança ou FK/cascade de domínio. `teste_socios`: processado FALSE, nome_normalizado NULL; `teste_destino`: vazio. `teste_migracao`: migrado FALSE. Para review, use IDs com lacunas e nomes NULL/vazios/espaços/acentos; SC, outros estados e UF NULL. Só a operação selecionada exige suas tabelas de dados, embora a allowlist de config seja fixa.

Control schema deve ser privado, inexistente/vazio ou já gerenciado por este runner. `prepare` instala as migrations do núcleo **somente nesse schema**, sem alterar public, salva snapshot JSONB/checksum em review_snapshots e não muda dados de domínio. Control/data schemas permanecem separados.

## 3. Check → prepare

```bash
npm start -- manual check --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
# Copie o checkToken exibido. Nunca reutilize token depois de alterar dados.
TOKEN='SHA256_EXIBIDO_PELO_CHECK'
npm start -- manual prepare --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --check-token "$TOKEN"
```

Check é read-only/dry-run, verifica catálogo, IDs, volume e dependências. Prepare exige token exato. Dataset já preparado não pode ser sobrescrito; restore é comando separado. Não preparar/alterar dados quando há job recuperável/ativo no mesmo controle.

### EXP-09: marcação separada, fora da medição

Troque OP para EXP-09 e dataset específico, faça check/prepare com migrado FALSE. **Depois**:

```bash
npm start -- manual check --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
TOKEN='NOVO_CHECK_TOKEN'
npm start -- manual mark --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --check-token "$TOKEN"
```

Mark verifica snapshot intacto e marca uf='SC' como migrado TRUE. O job não executa marcação. A/B medem/exercitam exclusivamente DELETE dos elegíveis limitados por H.

## 4. Rodada A

```bash
npm start -- manual check --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
TOKEN='NOVO_CHECK_TOKEN'
npm start -- manual run --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --mode A --check-token "$TOKEN" --batch-size 2 --throttle-ms 0 --statement-timeout-ms 5000 --lock-timeout-ms 500
```

O retorno contém ID e estado durável. Guarde ID; se a sessão cair, use list em outro terminal. Nenhum retry automático. completed não basta: validar depois.

```bash
ID='ID_RETORNADO'
npm start -- manual list --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
npm start -- manual status --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
npm start -- manual logs --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
npm start -- manual errors --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
npm start -- manual validate --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
```

Validate exige completed correspondente; compara resultado independente contra snapshot, conjuntos/NULL/vazio e origem/colunas intocadas. Divergência dá exit 1. EXP-06 esperado é UPPER(BTRIM(nome)); fixtures têm resultados literais independentes. EXP-08 exige todos os IDs/nome/documento, nenhuma extra e origem intacta. EXP-09 exige conjunto remanescente exato dos não-SC e nenhum alvo sobrevivente.

## 5. Restore/reset destrutivo — separado e explícito

**Só depois de validar a rodada e confirmar ausência de trabalho recuperável/ativo**:

```bash
npm start -- manual restore --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --reset-confirmation "RESTORE $OP $DATASET"
```

Este comando apaga/reinsere **somente os dados das tabelas necessárias da operação** a partir do snapshot controlado, numa transação. Preserva histórico/checkpoints e compara checksum após restore. Não faz DROP DATABASE, não executa SQL de artefato, não repara schema adulterado. Token anterior é inválido quando dados mudarem. Não executar restore para retomar execução pausada/falha: destruiria o vínculo dados/checkpoint.

Pending/running/paused/failed bloqueiam restore. Resolva via resume/recover/dispatch, investigue/fixe a causa sem alterar origem/predicado e conclua, ou peça cancelamento cooperativo com worker running. Não existe apagar história automaticamente nem reset de execução ativa. Se não puder resolver com segurança, pare e peça review; não force SQL sobre checkpoints.

## 6. Rodada B e controles em outro terminal

Após restore, EXP-09 exige **novo check + mark**. Todas as operações exigem novo check antes de run B:

```bash
npm start -- manual check --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET"
TOKEN='NOVO_CHECK_TOKEN'
npm start -- manual run --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --mode B --check-token "$TOKEN" --batch-size 1 --throttle-ms 200 --statement-timeout-ms 5000 --lock-timeout-ms 500
```

Throttle acima é só para observar controles manuais; não resultado/política de benchmark. Use list/status noutro terminal para obter ID enquanto run aguarda. B confirma prefixos; A é global e não pausa parcialmente.

```bash
# Terminal de controle, mesmos CFG/TARGET/OP/DATASET:
npm start -- manual pause --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
npm start -- manual status --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
# Aguardar status paused CONFIRMADO (pedido não é parada).
npm start -- manual resume --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
# Pending significa reenfileirado, não execução iniciada:
npm start -- manual dispatch --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
# Cancelamento cooperativo, somente quando running:
npm start -- manual cancel --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
```

Se o worker morreu/perdeu conexão, use `recover` **explicitamente**, seguido de dispatch, sem restaurar nem limpar destino da cópia. Posse ativa/protocolo inválido/terminal são recusados; idade não prova abandono:

```bash
npm start -- manual recover --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
npm start -- manual dispatch --config "$CFG" --confirm "$TARGET" --operation "$OP" --dataset "$DATASET" --id "$ID"
```

Repita status/logs/errors/validate após conclusão B e só então restore se desejar próxima rodada. SIGINT/SIGTERM solicita pausa local e espera lote; não promete deadline para JS arbitrário. Sinal Windows nativo não foi exercitado pelo agente.

## 7. Entregar para review

Guarde config **sem segredos**/identidade target, checksums/checkTokens, IDs, config efetiva A/B, saídas check/prepare/mark/run/status/validate/restore e erros. Não publique nomes/documentos reais. Registre as limitações em `REVIEW-FASE-C.md`: clone real não foi exercitado nesta entrega, resposta COMMIT perdida na rede não foi testada, snapshots pequenos não certificam backup, timings não são benchmark e dashboards/campanha permanecem posteriores.
