-- Produto fixo "Diversos": usado para vendas emergenciais de itens não cadastrados.
-- codigo = 'DIVERSOS' serve como identificador único no código (frontend/backend).
-- Preencha ncm/cst com o mesmo padrão fiscal usado nos demais produtos de mercado
-- antes de usar em produção, senão a NF-e vai cair no fallback "00000000" (NCM inválido).
INSERT INTO produtos (
  codigo, nome, marca, categoria, ncm, cfop, cst,
  preco, custo, estoque, estoque_min, unidade, ativo
) VALUES (
  'DIVERSOS', 'Diversos', NULL, 'mercado',
  'PREENCHER_NCM', '5102', 'PREENCHER_CST',
  0, 0, 999999, 0, 'un', true
)
ON CONFLICT (codigo) DO NOTHING;