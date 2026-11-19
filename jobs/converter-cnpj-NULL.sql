UPDATE teste_cnpj
SET cnpj_novo = null
WHERE cnpj_novo IS NOT NULL 
  AND id > :inicio AND id <= :fim;
