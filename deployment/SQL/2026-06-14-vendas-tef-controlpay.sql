ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS nsu_tef text,
  ADD COLUMN IF NOT EXISTS tef_intencao_id integer;