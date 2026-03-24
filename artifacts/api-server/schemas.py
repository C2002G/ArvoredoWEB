"""Pydantic schemas para validação de request/response."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# ─── Produto ───────────────────────────────────────────────────────────────

class ProdutoBase(BaseModel):
    nome: str
    marca: Optional[str] = None
    codigo: Optional[str] = None
    categoria: str = "mercado"
    preco: float
    custo: float = 0.0
    estoque: float = 0.0
    estoque_min: float = 5.0
    unidade: str = "un"
    validade: Optional[str] = None  # YYYY-MM-DD

class CriarProdutoInput(ProdutoBase):
    pass

class EditarProdutoInput(BaseModel):
    nome: Optional[str] = None
    marca: Optional[str] = None
    codigo: Optional[str] = None
    categoria: Optional[str] = None
    preco: Optional[float] = None
    custo: Optional[float] = None
    estoque: Optional[float] = None
    estoque_min: Optional[float] = None
    unidade: Optional[str] = None
    validade: Optional[str] = None
    ativo: Optional[bool] = None

class ProdutoOut(BaseModel):
    id: int
    codigo: Optional[str]
    nome: str
    marca: Optional[str]
    categoria: str
    preco: float
    custo: float
    estoque: float
    estoque_min: float
    unidade: str
    validade: Optional[str]
    ativo: bool
    criado_em: str

    class Config:
        from_attributes = True

class AlertasProdutosOut(BaseModel):
    estoque_baixo: List[ProdutoOut]
    vencendo: List[ProdutoOut]  # vence nos próximos 7 dias
    vencidos: List[ProdutoOut]  # já venceu
    total_alertas: int


# ─── Venda ─────────────────────────────────────────────────────────────────

class ItemVendaInput(BaseModel):
    produto_id: int
    quantidade: float
    preco_unit: float

class RegistrarVendaInput(BaseModel):
    categoria: str
    desconto: float = 0.0
    pagamento: str
    cliente_id: Optional[int] = None
    observacao: Optional[str] = None
    itens: List[ItemVendaInput]

class ItemVendaOut(BaseModel):
    id: int
    venda_id: int
    produto_id: int
    nome_snap: str
    quantidade: float
    preco_unit: float
    subtotal: float

    class Config:
        from_attributes = True

class VendaOut(BaseModel):
    id: int
    sessao_id: Optional[int]
    categoria: str
    total: float
    desconto: float
    pagamento: str
    cliente_id: Optional[int]
    cliente_nome: Optional[str]
    observacao: Optional[str]
    criado_em: str

    class Config:
        from_attributes = True

class ResumoVendas(BaseModel):
    total: float
    total_dinheiro: float
    total_pix: float
    total_cartao: float
    total_fiado: float
    num_vendas: int
    mercado: float
    cozinha: float


# ─── Estoque ───────────────────────────────────────────────────────────────

class MovimentoEstoqueInput(BaseModel):
    produto_id: int
    tipo: str  # entrada | saida | ajuste
    quantidade: float
    motivo: Optional[str] = None

class MovimentoEstoqueOut(BaseModel):
    id: int
    produto_id: int
    produto_nome: Optional[str]
    tipo: str
    quantidade: float
    motivo: Optional[str]
    criado_em: str

    class Config:
        from_attributes = True


# ─── Cliente ───────────────────────────────────────────────────────────────

class CriarClienteInput(BaseModel):
    nome: str
    apelido: Optional[str] = None
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    observacao: Optional[str] = None

class ClienteOut(BaseModel):
    id: int
    nome: str
    apelido: Optional[str]
    telefone: Optional[str]
    cpf: Optional[str]
    observacao: Optional[str]
    criado_em: str

    class Config:
        from_attributes = True

class FiadoItemOut(BaseModel):
    id: int
    venda_id: Optional[int]
    valor: float
    pago: bool
    pago_em: Optional[str]
    criado_em: str

    class Config:
        from_attributes = True

class ExtratoClienteOut(BaseModel):
    cliente: ClienteOut
    fiados: List[FiadoItemOut]
    total_aberto: float

class PagarFiadoInput(BaseModel):
    valor: float

class ResumoFiadoOut(BaseModel):
    cliente: ClienteOut
    total_aberto: float


# ─── Caixa ─────────────────────────────────────────────────────────────────

class SessaoCaixaOut(BaseModel):
    id: int
    aberto_em: str
    fechado_em: Optional[str]
    fundo_inicial: float
    total_dinheiro: float
    total_pix: float
    total_cartao: float
    total_fiado: float
    total_sangria: float
    status: str

    class Config:
        from_attributes = True

class StatusCaixaOut(BaseModel):
    aberto: bool
    sessao: Optional[SessaoCaixaOut]

class AbrirCaixaInput(BaseModel):
    fundo_inicial: float = 300.0

class SangriaOut(BaseModel):
    id: int
    sessao_id: int
    valor: float
    motivo: Optional[str]
    criado_em: str

    class Config:
        from_attributes = True

class SangriaInput(BaseModel):
    valor: float
    motivo: Optional[str] = None


# ─── Impressora ────────────────────────────────────────────────────────────

class ImprimirCupomInput(BaseModel):
    venda_id: int

class ImprimirSangriaInput(BaseModel):
    data_inicio: str  # YYYY-MM-DD
    data_fim: str     # YYYY-MM-DD
    sessao_id: Optional[int] = None

class ImpressaoResponse(BaseModel):
    ok: bool
    erro: Optional[str] = None


# ─── Sucesso genérico ──────────────────────────────────────────────────────

class SuccessResponse(BaseModel):
    ok: bool
    message: Optional[str] = None
