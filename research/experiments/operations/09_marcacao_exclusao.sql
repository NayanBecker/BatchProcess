-- EXP-09 — Atualização e exclusão em massa
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

UPDATE teste_migracao
SET migrado = TRUE
WHERE uf = 'SC';

DELETE FROM teste_migracao
WHERE migrado = TRUE;
