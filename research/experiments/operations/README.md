# Operações de benchmark — SQL original, ainda não executado

Estes arquivos preservam as dez operações enviadas por Nayan. **Não são migrations internas Knex, jobs implementados ou scripts A/B prontos.** Não estão registrados na CLI nem no runner `npm run migrate`.

Destino planejado: **postgres.public**, apenas tabelas auxiliares. Os SQLs originais não qualificam schema nem verificam banco; não rodar sem confirmar destino e search_path. A fonte `receitafederal_quadrosocietario` não é alvo de escrita.

| ID | Arquivo | Operação |
|---|---|---|
| 01 | `01_cnpj_texto.sql` | CNPJ numérico → texto; inclui DROP/RENAME posteriores |
| 02 | `02_tipo_pessoa_descricao.sql` | Código → descrição |
| 03 | `03_empresa_jsonb.sql` | Colunas → JSONB |
| 04 | `04_qualificacao_referencia.sql` | Tabela de referência + JOIN |
| 05 | `05_separacao_nome.sql` | Primeiro nome e sobrenome |
| 06 | `06_padronizacao_nome.sql` | Nome em maiúsculas e TRIM |
| 07 | `07_classificacao_qualificacao.sql` | Categoria por descrição |
| 08 | `08_copia_socios.sql` | Cópia para destino, sem excluir origem |
| 09 | `09_marcacao_exclusao.sql` | Marcação e DELETE |
| 10 | `10_tipo_pessoa_ddl.sql` | Referência histórica DDL, fora do benchmark |

## Antes de executar

1. Seguir o [protocolo versão 3](../../docs/experiments/protocol.md), com decisões da Fase B fechadas.
2. Implementar/validar runners, restauração e métricas/visualização antes dos benchmarks.
3. Restaurar schema e dados antes de cada modo/repetição. Não executar estes arquivos em sequência como uma única migração.
4. Separar preparação, operação medida, validação e finalização. O EXP-01 exige validação antes de DROP/RENAME; o arquivo não automatiza essa pausa.
5. Não considerar os scripts globalmente idempotentes: DDL pode falhar ao repetir; INSERT pode conflitar; DROP remove a coluna de origem.

**Decisões registradas; implementação pendente:** EXP-05 executável deverá normalizar espaços ASCII e deixar sobrenome NULL para nome único (o original arquivado ainda repete o nome). EXP-06 mantém espaços internos. EXP-08 inicia vazio e retoma por checkpoint atômico, sem ignorar conflitos. EXP-09 mede apenas DELETE, marcação é preparação. EXP-10 foi excluído do escopo. Nenhum SQL original foi alterado ou executado para fechar essas decisões.

`manifest.json` registra os arquivos arquivados e sua quantidade de comandos. `executed: false` descreve esta entrega, não é controle automático de execuções futuras.
