-- Unidades (peças) por linha, separado do peso em kg (quantidade) na feira
ALTER TABLE itens_venda ADD COLUMN IF NOT EXISTS unidades real;
