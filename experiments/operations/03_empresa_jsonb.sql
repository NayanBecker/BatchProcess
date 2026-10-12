-- EXP-03 — Conversão de colunas relacionais para JSONB
-- SQL original do usuário, preservado; NÃO EXECUTADO.
-- Destino planejado: postgres.public, somente tabelas auxiliares.
-- Não integrar ao runner de migrations internas. Restaurar antes de cada ensaio.
-- Contém etapas preparatórias/finais quando previstas; ler README antes de usar.

ALTER TABLE teste_empresas
ADD COLUMN dados_empresa JSONB;

UPDATE teste_empresas
SET dados_empresa = jsonb_build_object(
    'identificacao', jsonb_build_object(
        'cnpj', cnpj,
        'razao_social', razao_social
    ),
    'localizacao', jsonb_build_object(
        'uf', uf
    ),
    'situacao', COALESCE(situacao, 'Não informada')
)
WHERE dados_empresa IS NULL;
