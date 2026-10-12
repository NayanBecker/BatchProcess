# Preparação das tabelas auxiliares — 2026-10-02

## Escopo autorizado

Nayan autorizou criar as seis tabelas no mesmo banco da origem (`postgres`, schema `public`) e copiar todos os registros. Isso substitui, para este dataset experimental, a proposta de dados sintéticos em `tcc_framework_test`. O banco auxiliar da Fase A continua separado; não alterar automaticamente a conexão global do framework.

Origem: `public.receitafederal_quadrosocietario`. Nenhuma escrita, DDL ou exclusão na origem foi enviada. Não foi feita auditoria integral antes/depois de suas linhas; não alegar hash ou prova de ausência de alterações por terceiros.

## Script

`prepare_auxiliary_tables.sql` cria tabelas e copia dados numa transação REPEATABLE READ. Não é idempotente: falha se uma tabela já existir e não apaga dados para tentar novamente. Não executar novamente sobre a preparação concluída.

Comando utilizado na raiz do repositório (Git Bash):

```bash
docker exec -i dbpostgres psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < experiments/setup/prepare_auxiliary_tables.sql
```

A transação verifica contagens das cinco cópias integrais contra a origem e da sexta contra o filtro. Divergência gera exceção antes do commit. ANALYZE das seis tabelas ocorre após o commit.

## Evidências observadas

- Origem: 17.447.222 registros; zero IDs nulos e zero diferença entre count(*) e count(DISTINCT id_socio_empresa).
- Todos os 17.447.222 registros passam no filtro de CNPJ do script.
- Tipos e comprimentos foram conferidos no information_schema, sem exibir dados pessoais.
- Nenhuma tabela auxiliar existia antes da execução.
- A chamada inicial excedeu o limite de espera da ferramenta, mas a sessão PostgreSQL 440 continuou ativa. O script não foi reenviado.
- Acompanhamento observou as etapas INSERT, bloco de validação, e ANALYZE após commit.
- Releitura em outra conexão confirmou as seis tabelas comprometidas; a sessão 440 terminou e last_analyze foi preenchido nas seis tabelas.
- O commit confirma que as verificações de igualdade de contagens do script passaram. A saída original dos NOTICE/COMMIT não foi recuperada devido ao timeout; não apresentar como log capturado.
- Uma consulta redundante pós-commit com seis COUNT(*) ultrapassou o timeout e sua saída não foi recuperada. Ao tentar cancelar especificamente essa consulta, ela já não estava ativa. Não foi repetida. n_live_tup contém estimativas, não substitui contagens exatas.

Tamanhos totais observados, incluindo índices (pg_size_pretty):

| Tabela | Tamanho |
|---|---:|
| teste_empresas | 2279 MB |
| teste_socios | 1800 MB |
| teste_documentos | 1968 MB |
| teste_qualificacoes | 2071 MB |
| teste_migracao | 2048 MB |
| teste_cnpj | 1376 MB |

Autovacuum foi observado após a preparação; não usar esse estado transitório para benchmark sem procedimento de estabilização documentado.

## Limitações e próximos passos

- Criação/alimentação não é benchmark nem validação de desempenho do framework.
- Não foram executados jobs ou transformações experimentais. Métricas e visualização devem estar prontas antes dos testes, conforme pedido.
- O SQL preserva o mapeamento fornecido: teste_empresas tem uma linha por id_socio_empresa, não necessariamente uma empresa única por CNPJ.
- teste_cnpj armazena a conversão numérica fornecida; a definição futura da transformação deve especificar como tratar zeros à esquerda, nulos e comprimento, antes da avaliação.
- Contagens/PKs e cópia SQL direta não equivalem a auditoria independente campo a campo. Essa validação adicional pode ser feita fora da janela de benchmark.
- Antes de A/B, definir operação principal, estado inicial restaurável, corte de IDs e contrato transacional. Não executar B sobre o resultado já modificado por A.
- Não mover migrations internas do framework para postgres nem alterar .env sem confirmação específica. O runner seguro da Fase A continua dedicado a tcc_framework_test.
