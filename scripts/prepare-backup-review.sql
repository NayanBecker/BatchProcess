\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='15s';
SELECT pg_advisory_xact_lock(hashtextextended('backup_testes/review_data/benchmark_control:setup',0));
DO $$
DECLARE s text; owner_name text; marker text;
BEGIN
 IF current_database()<>'backup_testes' THEN RAISE EXCEPTION 'Destino diferente de backup_testes'; END IF;
 FOREACH s IN ARRAY ARRAY['review_data','benchmark_control'] LOOP
  SELECT pg_get_userbyid(nspowner),obj_description(oid,'pg_namespace') INTO owner_name,marker FROM pg_namespace WHERE nspname=s;
  IF FOUND THEN
   IF owner_name<>current_user OR marker IS DISTINCT FROM 'tcc-backup-review-v1' THEN RAISE EXCEPTION 'Schema existente desconhecido: %',s; END IF;
  ELSE
   EXECUTE format('CREATE SCHEMA %I',s);
   EXECUTE format('COMMENT ON SCHEMA %I IS %L',s,'tcc-backup-review-v1');
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='review_data' AND c.relkind IN ('r','p','v','m','f') AND c.relname NOT IN ('teste_socios','teste_destino','teste_migracao')) THEN RAISE EXCEPTION 'Objeto desconhecido em review_data'; END IF;
 IF to_regclass('review_data.teste_socios') IS NOT NULL OR to_regclass('review_data.teste_destino') IS NOT NULL OR to_regclass('review_data.teste_migracao') IS NOT NULL THEN
  IF to_regclass('review_data.teste_socios') IS NULL OR to_regclass('review_data.teste_destino') IS NULL OR to_regclass('review_data.teste_migracao') IS NULL THEN RAISE EXCEPTION 'Preparacao parcial: parar sem reset'; END IF;
  RETURN; -- Idempotência: nunca recarregar/restaurar implicitamente.
 END IF;
 CREATE TABLE review_data.teste_socios(id bigint PRIMARY KEY,nome text,nome_normalizado text,documento text,processado boolean NOT NULL DEFAULT false);
 CREATE TABLE review_data.teste_destino(id bigint PRIMARY KEY,nome text,documento text);
 CREATE TABLE review_data.teste_migracao(id bigint PRIMARY KEY,uf text,migrado boolean NOT NULL DEFAULT false);
 INSERT INTO review_data.teste_socios(id,nome,documento)
 SELECT id,nome::text,documento::text FROM public.teste_socios ORDER BY id LIMIT 20;
 -- UFs controladas, não uma afirmação sobre as UFs da fonte. Somente IDs reais;
 -- cenário SC/nonSC determinístico sem varrer tabela grande para achar elegíveis.
 INSERT INTO review_data.teste_migracao(id,uf)
 SELECT id,CASE WHEN row_number() OVER(ORDER BY id)%2=0 THEN 'SC' ELSE 'PR' END FROM (SELECT id FROM public.teste_migracao ORDER BY id LIMIT 20) s;
 IF (SELECT count(*) FROM review_data.teste_socios)<>20 OR (SELECT count(*) FROM review_data.teste_migracao)<>20 THEN RAISE EXCEPTION 'Fonte pequena insuficiente: rollback'; END IF;
END $$;
COMMIT;
SELECT current_database() AS database;
SELECT 'teste_socios' AS table_name,count(*) AS rows,min(id),max(id),count(*) FILTER(WHERE processado) AS flagged FROM review_data.teste_socios
UNION ALL SELECT 'teste_destino',count(*),min(id),max(id),0 FROM review_data.teste_destino
UNION ALL SELECT 'teste_migracao',count(*),min(id),max(id),count(*) FILTER(WHERE migrado) FROM review_data.teste_migracao;
SELECT count(*) FILTER(WHERE uf='SC') AS sc,count(*) FILTER(WHERE uf<>'SC') AS non_sc FROM review_data.teste_migracao;
