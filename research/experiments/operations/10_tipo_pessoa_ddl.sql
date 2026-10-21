-- EXP-10 — Alteração direta do tipo de uma coluna
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

ALTER TABLE teste_documentos
ALTER COLUMN tipo_pessoa
TYPE VARCHAR(20)
USING tipo_pessoa::VARCHAR(20);
