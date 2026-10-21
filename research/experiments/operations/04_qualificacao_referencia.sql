-- EXP-04 — Normalização de dados com relacionamento entre tabelas
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

CREATE TABLE teste_qualificacoes_ref (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(20),
    descricao TEXT,
    UNIQUE (codigo, descricao)
);

INSERT INTO teste_qualificacoes_ref (
    codigo, descricao
)
SELECT DISTINCT
    codigo,
    descricao
FROM teste_qualificacoes
WHERE codigo IS NOT NULL
  AND descricao IS NOT NULL;

ALTER TABLE teste_qualificacoes
ADD COLUMN qualificacao_id BIGINT;

UPDATE teste_qualificacoes AS t
SET qualificacao_id = q.id
FROM teste_qualificacoes_ref AS q
WHERE t.codigo = q.codigo
  AND t.descricao = q.descricao
  AND t.qualificacao_id IS NULL;
