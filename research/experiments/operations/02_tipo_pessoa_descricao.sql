-- EXP-02 — Conversão de código numérico para descrição
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

ALTER TABLE teste_socios
ADD COLUMN tipo_pessoa_descricao VARCHAR(30);

UPDATE teste_socios
SET tipo_pessoa_descricao = CASE
    WHEN tipo_pessoa = 1 THEN 'Pessoa Jurídica'
    WHEN tipo_pessoa = 2 THEN 'Pessoa Física'
    WHEN tipo_pessoa = 3 THEN 'Estrangeiro'
    ELSE 'Não identificado'
END
WHERE tipo_pessoa_descricao IS NULL;
