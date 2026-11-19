-- OPTIONAL: only a confirmed disposable database, separate from executable jobs.
BEGIN;
CREATE TABLE public.teste_cnpj (id BIGINT PRIMARY KEY, cnpj_antigo BIGINT, cnpj_novo TEXT);
INSERT INTO public.teste_cnpj VALUES
 (1, 0, NULL), (3, NULL, NULL), (5, 123, 'already-set'),
 (9007199254740993, 12345678901234, NULL), (9007199254740995, 42, NULL);
COMMIT;
