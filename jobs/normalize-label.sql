UPDATE demo_items
SET normalized_label = upper(trim(label))
WHERE normalized_label IS DISTINCT FROM upper(trim(label))
  AND id > :inicio AND id <= :fim;
