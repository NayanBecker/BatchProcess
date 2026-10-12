-- EXP-05 — Separação de nome completo
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

ALTER TABLE teste_socios
ADD COLUMN primeiro_nome VARCHAR(255),
ADD COLUMN sobrenome VARCHAR(255);

UPDATE teste_socios
SET
    primeiro_nome = SPLIT_PART(
        TRIM(nome),
        ' ',
        1
    ),
    sobrenome = NULLIF(
        SUBSTRING(
            TRIM(nome)
            FROM POSITION(' ' IN TRIM(nome)) + 1
        ),
        ''
    )
WHERE nome IS NOT NULL
  AND primeiro_nome IS NULL;
