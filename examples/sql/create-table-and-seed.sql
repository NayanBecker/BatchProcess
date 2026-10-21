-- OPTIONAL synthetic example. Execute only in your explicitly selected disposable DB.
-- psql "$YOUR_DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f examples/sql/create-table-and-seed.sql
-- No DROP, truncate, overwrite or control-table installation.
BEGIN;
CREATE TABLE public.demo_items (
 id bigint PRIMARY KEY CHECK (id > 0),
 label text,
 normalized_label text
);
INSERT INTO public.demo_items(id,label) VALUES
 (1,' alpha '),(2,'beta'),(3,NULL),(5,' delta '),(8,'epsilon'),(13,' zeta ');
COMMIT;
