-- EXP-07 — Classificação de qualificações
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

UPDATE teste_qualificacoes
SET categoria = CASE
    WHEN descricao ILIKE '%Administrador%'
        THEN 'Administração'

    WHEN descricao ILIKE '%Diretor%'
        THEN 'Diretoria'

    WHEN descricao ILIKE '%Presidente%'
        THEN 'Presidência'

    ELSE 'Outros'
END
WHERE categoria IS NULL;
