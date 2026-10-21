# Teste local autorizado — backup Docker descartável

> **SUPERSEDED / HISTÓRICO SUPERADO.** Relato preservado, não roteiro executável. validate de resultados e restore foram retirados; use docs/TESTE-BACKUP-LOCAL.md atual. Nenhuma evidência abaixo foi repetida nesta retirada.

**Ambiente já preparado e testado**, sem benchmark. Destino único:
`backup_testes/review_data/benchmark_control`, container `dbpostgres`, host `127.0.0.1:5432`.
`postgres`, a tabela principal e todas as tabelas `public` continuam sem escrita.
Não remova o limite de 1000 linhas nem os guards.

## O que existe agora

- `review_data.teste_socios`: 20 registros reais das auxiliares, IDs **4514090–4514109**, nome/documento somente dentro do banco; normalização NULL e processado false.
- `review_data.teste_destino`: vazio.
- `review_data.teste_migracao`: os mesmos 20 IDs reais da auxiliar, migrado false. **UF controlada de teste**, alternando PR/SC por posição: 10 de cada. Não representa a UF real da fonte. Os pequenos probes por PK não encontraram SC; não foi feita varredura da tabela grande.
- `benchmark_control`: controle instalado, três snapshots preparados e histórico preservado. Schemas pertencem a postgres e têm marcador `tcc-backup-review-v1`.

Preparação usa somente `ORDER BY id LIMIT 20` nas auxiliares indexadas, nunca a principal. Tabelas pequenas têm a forma exata exigida pelo runner; não são as auxiliares públicas completas. `prepare-data` é idempotente: não recarrega nem reseta tabelas existentes. Schema preexistente sem proprietário/marcador esperado causa rollback e parada; não adote schema alheio adicionando marcador.

## Repetir no Windows / Git Bash

```bash
cd /m/ProjetoTcc/Processamento_em_loteV5
npm run build
npm run db:check
node scripts/backup-review.cjs prepare-data
node scripts/backup-review.cjs check-config
```

Esperado: db:check confirma **tcc_framework_test**; prepare-data mostra 20/0/20 linhas, flags 0, SC/nonSC 10/10; check-config retorna valid true e connectionOpened false.

O wrapper carrega a configuração existente da aplicação com seu loader nativo **sem abrir pool global**, mapeia a senha somente no ambiente do subprocesso para `BATCH_REVIEW_PASSWORD` e executa a CLI compilada real. O runner lê apenas a variável cujo nome consta em `connection.passwordEnv`; não busca senha em .env/PGPASSWORD nem imprime segredo. Não há senha na config ou neste roteiro. A configuração global e .env não foram alterados. Não é necessário informar senha no chat.

Os datasets **já estão preparados**; não execute `prepare` novamente. Ele recusa sobrescrever snapshot. Para banco descartável recém-recriado, após prepare-data/check-config, prepare uma única vez:

```bash
node scripts/backup-review.cjs prepare EXP-06
node scripts/backup-review.cjs prepare EXP-08
node scripts/backup-review.cjs prepare EXP-09
```

Para repetir os testes agora, use a função abaixo: captura o ID realmente retornado, sem pressupor sequência, e chama validate imediatamente, antes do restore. `prepare`, `mark` e `run` já fazem check e passam o token real automaticamente.

```bash
tcc_run() {
  local out id
  out=$(node scripts/backup-review.cjs run "$1" "$2") || return
  printf '%s\n' "$out"
  id=$(node -e 'const s=require("node:fs").readFileSync(0,"utf8").trim().split(/\r?\n/).pop();process.stdout.write(String(JSON.parse(s).id))' <<< "$out") || return
  node scripts/backup-review.cjs validate "$1" "$2" "$id"
}

# UPDATE: A/B, sempre validar antes de restaurar.
tcc_run EXP-06 A && node scripts/backup-review.cjs restore EXP-06 &&
tcc_run EXP-06 B && node scripts/backup-review.cjs restore EXP-06

# INSERT: destino vazio; origem preservada.
tcc_run EXP-08 A && node scripts/backup-review.cjs restore EXP-08 &&
tcc_run EXP-08 B && node scripts/backup-review.cjs restore EXP-08

# DELETE: mark obrigatório depois de cada restore, antes de run.
node scripts/backup-review.cjs mark EXP-09 && tcc_run EXP-09 A &&
node scripts/backup-review.cjs restore EXP-09 &&
node scripts/backup-review.cjs mark EXP-09 && tcc_run EXP-09 B &&
node scripts/backup-review.cjs restore EXP-09

node scripts/backup-review.cjs list EXP-06
node scripts/backup-review.cjs list EXP-08
node scripts/backup-review.cjs list EXP-09
node scripts/backup-review.cjs prepare-data
```

Cada run deve terminar `completed`; cada validate deve retornar `validated:true, divergences:0`. Lote B = 7. Mark retorna `marked:10, measured:false`. Restore é pedido destrutivo explícito somente para as tabelas privadas do snapshot: wrapper fornece a confirmação separada exata `RESTORE EXP-ID DATASET`, mantém jobs/checkpoints/logs e nunca roda implicitamente. Se houver execução pending/running/paused/failed, **pare e resolva-a**, não apague histórico para destravar. Não restaure para retomar execução. Após os restores, estado final volta a 20/0/20 e flags zero.

Validação de um ID histórico depois do restore não deve passar: validate compara os dados atuais ao resultado daquele job, não certifica retrospectivamente dados já restaurados.

## Evidência real registrada

Executado: Docker psql metadata/current_database → prepare-data → CLI check-config/check/prepare → run A/B → validate → restores explícitos. Primeira rodada IDs 1–6; rodada com guards finais IDs **7–12**, todos completed:

| Operação / dataset | A | B | Alterações A/B | Commits A/B | Divergências A/B |
|---|---:|---:|---|---|---|
| EXP-06 / backup-local-06-v1 | 7 | 8 | UPDATE 20/20 | 1/3 | 0/0 |
| EXP-08 / backup-local-08-v1 | 9 | 10 | INSERT 20/20 | 1/3 | 0/0 |
| EXP-09 / backup-local-09-v1 | 11 | 12 | DELETE 10/10 | 1/2 | 0/0 |

Todos terminaram com cursor = highWater = 4514109. A função Git Bash deste roteiro também foi executada: criou o ID **13** (EXP-06 B), capturou esse ID automaticamente, validou divergências zero e restaurou explicitamente. Leitura final do catálogo confirmou **13 jobs completed, zero não-completed, três snapshots**; prepare-data novamente confirmou o estado inicial restaurado e idempotência. Saídas de validação incluíram:

```json
{"id":7,"divergences":0,"validated":true,"snapshotChecksum":"e5b9d2ef0cf60ee0b14512303fea94fd99a8721a08611303c231f94458d77852"}
{"id":9,"divergences":0,"validated":true,"snapshotChecksum":"8eefa8c93dff39be4af7fcec40c2f1776a0824f9b8a8e9b55ccb02af0decbabe"}
{"id":11,"divergences":0,"validated":true,"snapshotChecksum":"b1db453456b2b8bdef3b5ece851e370a04579aa4d4be6c041bb08cb0303002e2"}
```

Regressão executada: RED opt-in/auth (2 falhas esperadas); GREEN; RED posse de schemas (rejeição ausente); GREEN; `npm run build` sucesso, `npm test` **42/42**, db:check confirmado antes de `npm run test:integration` **51/51**, `git diff --check` sem erros (avisos de LF/CRLF preexistentes). Um SELECT de evidência usou nome de coluna inexistente; foi corrigido por consulta ao catálogo, sem escrita ou impacto nos testes.

Isto valida teste funcional pequeno, não desempenho, igualdade do backup completo ou processamento massivo de public. Nomes/documentos não foram incluídos em stdout/docs/config. Preparação deve ser exclusiva: administrador externo não deve alterar schemas/dados durante o review.
