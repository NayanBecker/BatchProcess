UPDATE teste_cnpj
SET cnpj_novo = LPAD(cnpj_antigo::TEXT, 14, '0')
WHERE cnpj_novo IS NULL AND cnpj_antigo IS NOT NULL
  AND id > :inicio AND id <= :fim;
