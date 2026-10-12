-- EXP-06 — Padronização de nomes
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

UPDATE teste_socios
SET
    nome_normalizado = UPPER(TRIM(nome)),
    processado = TRUE
WHERE processado = FALSE;
