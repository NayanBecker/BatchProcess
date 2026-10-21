-- EXP-01 — Conversão de CNPJ numérico para VARCHAR
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

-- ATENÇÃO: executar DROP/RENAME somente após validar a conversão, fora da medição DML.
UPDATE teste_cnpj
SET cnpj_novo = LPAD(cnpj_antigo::TEXT, 14, '0')
WHERE cnpj_novo IS NULL
  AND cnpj_antigo IS NOT NULL;

ALTER TABLE teste_cnpj
DROP COLUMN cnpj_antigo;

ALTER TABLE teste_cnpj
RENAME COLUMN cnpj_novo TO cnpj;
