-- EXP-08 — Migração de registros entre tabelas
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

CREATE TABLE teste_destino (
    id BIGINT PRIMARY KEY,
    nome VARCHAR(255),
    documento VARCHAR(20)
);

INSERT INTO teste_destino (
    id, nome, documento
)
SELECT
    id,
    nome,
    documento
FROM teste_socios;
