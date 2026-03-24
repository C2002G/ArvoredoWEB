"""Modelos SQLAlchemy — todas as tabelas do sistema Arvoredo PDV."""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum, Text
)
from sqlalchemy.orm import relationship
from database import Base


class Produto(Base):
    __tablename__ = "produtos"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String, nullable=True, index=True)
    nome = Column(String, nullable=False)
    marca = Column(String, nullable=True)
    categoria = Column(Enum("mercado", "cozinha", name="categoria"), nullable=False, default="mercado")
    preco = Column(Float, nullable=False)
    custo = Column(Float, default=0.0)
    estoque = Column(Float, default=0.0)
    estoque_min = Column(Float, default=5.0)
    unidade = Column(String, default="un")
    validade = Column(String, nullable=True)  # ISO date string YYYY-MM-DD
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=datetime.utcnow)


class SessaoCaixa(Base):
    __tablename__ = "sessoes_caixa"

    id = Column(Integer, primary_key=True, index=True)
    aberto_em = Column(DateTime, default=datetime.utcnow)
    fechado_em = Column(DateTime, nullable=True)
    fundo_inicial = Column(Float, default=300.0)
    total_dinheiro = Column(Float, default=0.0)
    total_pix = Column(Float, default=0.0)
    total_cartao = Column(Float, default=0.0)
    total_fiado = Column(Float, default=0.0)
    total_sangria = Column(Float, default=0.0)
    status = Column(Enum("aberto", "fechado", name="status_caixa"), default="aberto")

    sangrias = relationship("Sangria", back_populates="sessao")
    vendas = relationship("Venda", back_populates="sessao")


class Sangria(Base):
    __tablename__ = "sangrias"

    id = Column(Integer, primary_key=True, index=True)
    sessao_id = Column(Integer, ForeignKey("sessoes_caixa.id"), nullable=False)
    valor = Column(Float, nullable=False)
    motivo = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    sessao = relationship("SessaoCaixa", back_populates="sangrias")


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    apelido = Column(String, nullable=True)
    telefone = Column(String, nullable=True)
    cpf = Column(String, nullable=True)
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    fiados = relationship("Fiado", back_populates="cliente")
    vendas = relationship("Venda", back_populates="cliente")


class Venda(Base):
    __tablename__ = "vendas"

    id = Column(Integer, primary_key=True, index=True)
    sessao_id = Column(Integer, ForeignKey("sessoes_caixa.id"), nullable=True)
    categoria = Column(String, nullable=False)
    total = Column(Float, nullable=False)
    desconto = Column(Float, default=0.0)
    pagamento = Column(Enum("dinheiro", "pix", "cartao", "fiado", name="pagamento"), nullable=False)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True)
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    sessao = relationship("SessaoCaixa", back_populates="vendas")
    cliente = relationship("Cliente", back_populates="vendas")
    itens = relationship("ItemVenda", back_populates="venda")
    fiados = relationship("Fiado", back_populates="venda")


class ItemVenda(Base):
    __tablename__ = "itens_venda"

    id = Column(Integer, primary_key=True, index=True)
    venda_id = Column(Integer, ForeignKey("vendas.id"), nullable=False)
    produto_id = Column(Integer, ForeignKey("produtos.id"), nullable=False)
    nome_snap = Column(String, nullable=False)
    quantidade = Column(Float, nullable=False)
    preco_unit = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=False)

    venda = relationship("Venda", back_populates="itens")
    produto = relationship("Produto")


class Fiado(Base):
    __tablename__ = "fiados"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    venda_id = Column(Integer, ForeignKey("vendas.id"), nullable=True)
    valor = Column(Float, nullable=False)
    pago = Column(Boolean, default=False)
    pago_em = Column(DateTime, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    cliente = relationship("Cliente", back_populates="fiados")
    venda = relationship("Venda", back_populates="fiados")


class MovimentoEstoque(Base):
    __tablename__ = "movimentos_estoque"

    id = Column(Integer, primary_key=True, index=True)
    produto_id = Column(Integer, ForeignKey("produtos.id"), nullable=False)
    tipo = Column(Enum("entrada", "saida", "ajuste", name="tipo_movimento"), nullable=False)
    quantidade = Column(Float, nullable=False)
    motivo = Column(Text, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    produto = relationship("Produto")
