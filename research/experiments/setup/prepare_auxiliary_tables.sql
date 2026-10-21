-- Preparação autorizada: postgres.public. Não é benchmark.
-- Executar com psql -X -v ON_ERROR_STOP=1. Não repetir sobre tabelas existentes.
-- Nenhum DROP/TRUNCATE/UPDATE na origem. DDL e cópia em uma transação.
\set ON_ERROR_STOP on
\timing on
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ BEGIN
 IF current_database() <> 'postgres' THEN
  RAISE EXCEPTION 'Destino esperado: postgres';
 END IF;
END $$;
CREATE TABLE public.teste_empresas (
 id BIGINT PRIMARY KEY, cnpj VARCHAR(14), razao_social VARCHAR(255),
 uf CHAR(2), situacao VARCHAR(20), data_atualizacao TIMESTAMP
);
CREATE TABLE public.teste_socios (
 id BIGINT PRIMARY KEY, nome VARCHAR(255), documento VARCHAR(20),
 tipo_pessoa SMALLINT, nome_normalizado VARCHAR(255), processado BOOLEAN DEFAULT FALSE
);
CREATE TABLE public.teste_documentos (
 id BIGINT PRIMARY KEY, cnpj VARCHAR(20), tipo_pessoa SMALLINT,
 codigo_qualificacao VARCHAR(20), descricao_qualificacao TEXT
);
CREATE TABLE public.teste_qualificacoes (
 id BIGINT PRIMARY KEY, nome_socio VARCHAR(255), codigo VARCHAR(20),
 descricao TEXT, categoria VARCHAR(50)
);
CREATE TABLE public.teste_migracao (
 id BIGINT PRIMARY KEY, cnpj VARCHAR(14), nome_socio VARCHAR(255),
 uf CHAR(2), migrado BOOLEAN DEFAULT FALSE
);
CREATE TABLE public.teste_cnpj (
 id BIGINT PRIMARY KEY, cnpj_antigo BIGINT, cnpj_novo VARCHAR(14)
);
INSERT INTO public.teste_empresas (id,cnpj,razao_social,uf)
 SELECT id_socio_empresa,nr_cnpj,nm_razao_social,sg_uf FROM public.receitafederal_quadrosocietario;
INSERT INTO public.teste_socios (id,nome,documento,tipo_pessoa)
 SELECT id_socio_empresa,nm_socio,nr_cpf_cnpj_socio,in_cpf_cnpj FROM public.receitafederal_quadrosocietario;
INSERT INTO public.teste_documentos (id,cnpj,tipo_pessoa,codigo_qualificacao,descricao_qualificacao)
 SELECT id_socio_empresa,nr_cnpj,in_cpf_cnpj,cd_qualificacao_socio,ds_qualificacao_socio FROM public.receitafederal_quadrosocietario;
INSERT INTO public.teste_qualificacoes (id,nome_socio,codigo,descricao)
 SELECT id_socio_empresa,nm_socio,cd_qualificacao_socio,ds_qualificacao_socio FROM public.receitafederal_quadrosocietario;
INSERT INTO public.teste_migracao (id,cnpj,nome_socio,uf)
 SELECT id_socio_empresa,nr_cnpj,nm_socio,sg_uf FROM public.receitafederal_quadrosocietario;
INSERT INTO public.teste_cnpj (id,cnpj_antigo)
 SELECT id_socio_empresa,nr_cnpj::BIGINT FROM public.receitafederal_quadrosocietario
 WHERE nr_cnpj ~ '^[0-9]{1,14}$';
DO $$ DECLARE expected bigint; actual bigint; t text; BEGIN
 SELECT count(*) INTO expected FROM public.receitafederal_quadrosocietario;
 FOREACH t IN ARRAY ARRAY['teste_empresas','teste_socios','teste_documentos','teste_qualificacoes','teste_migracao'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO actual;
  IF actual <> expected THEN RAISE EXCEPTION 'Contagem divergente: %',t; END IF;
  RAISE NOTICE '%: % registros',t,actual;
 END LOOP;
 SELECT count(*) INTO expected FROM public.receitafederal_quadrosocietario WHERE nr_cnpj ~ '^[0-9]{1,14}$';
 SELECT count(*) INTO actual FROM public.teste_cnpj;
 IF actual <> expected THEN RAISE EXCEPTION 'Contagem divergente: teste_cnpj'; END IF;
 RAISE NOTICE 'teste_cnpj: % registros',actual;
END $$;
COMMIT;
ANALYZE public.teste_empresas;
ANALYZE public.teste_socios;
ANALYZE public.teste_documentos;
ANALYZE public.teste_qualificacoes;
ANALYZE public.teste_migracao;
ANALYZE public.teste_cnpj;
