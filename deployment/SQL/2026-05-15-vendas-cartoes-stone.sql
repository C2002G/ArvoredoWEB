ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS cnpj_credenciadora text,
  ADD COLUMN IF NOT EXISTS codigo_autorizacao text,
  ADD COLUMN IF NOT EXISTS bandeira_cartao text,
  ADD COLUMN IF NOT EXISTS tipo_pagamento text;
