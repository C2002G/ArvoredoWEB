"""Rotas de Vendas."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Venda, ItemVenda, Produto, SessaoCaixa, Fiado, Cliente
from schemas import RegistrarVendaInput, VendaOut, ItemVendaOut, ResumoVendas

router = APIRouter()


def fmt_venda(v: Venda, cliente_nome: Optional[str] = None) -> dict:
    return {
        "id": v.id,
        "sessao_id": v.sessao_id,
        "categoria": v.categoria,
        "total": v.total,
        "desconto": v.desconto,
        "pagamento": v.pagamento,
        "cliente_id": v.cliente_id,
        "cliente_nome": cliente_nome or (v.cliente.nome if v.cliente else None),
        "observacao": v.observacao,
        "criado_em": v.criado_em.isoformat() if v.criado_em else None,
    }


@router.get("/resumo/hoje", response_model=ResumoVendas)
def resumo_hoje(db: Session = Depends(get_db)):
    inicio = datetime.combine(date.today(), datetime.min.time())
    fim = datetime.combine(date.today(), datetime.max.time())
    vendas = db.query(Venda).filter(Venda.criado_em >= inicio, Venda.criado_em <= fim).all()

    resumo = dict(total=0, total_dinheiro=0, total_pix=0, total_cartao=0,
                  total_fiado=0, num_vendas=len(vendas), mercado=0, cozinha=0)
    for v in vendas:
        resumo["total"] += v.total
        resumo[f"total_{v.pagamento}"] = resumo.get(f"total_{v.pagamento}", 0) + v.total
        resumo[v.categoria] = resumo.get(v.categoria, 0) + v.total
    return resumo


@router.get("/{id}/itens", response_model=List[ItemVendaOut])
def itens_da_venda(id: int, db: Session = Depends(get_db)):
    itens = db.query(ItemVenda).filter(ItemVenda.venda_id == id).all()
    return [{"id": i.id, "venda_id": i.venda_id, "produto_id": i.produto_id,
             "nome_snap": i.nome_snap, "quantidade": i.quantidade,
             "preco_unit": i.preco_unit, "subtotal": i.subtotal} for i in itens]


@router.get("/", response_model=List[VendaOut])
def listar_vendas(data: Optional[str] = None, data_inicio: Optional[str] = None,
                  data_fim: Optional[str] = None, categoria: Optional[str] = None,
                  limit: int = 50, db: Session = Depends(get_db)):
    query = db.query(Venda)
    if data:
        d = date.fromisoformat(data)
        query = query.filter(
            Venda.criado_em >= datetime.combine(d, datetime.min.time()),
            Venda.criado_em <= datetime.combine(d, datetime.max.time()),
        )
    if data_inicio:
        d = date.fromisoformat(data_inicio)
        query = query.filter(Venda.criado_em >= datetime.combine(d, datetime.min.time()))
    if data_fim:
        d = date.fromisoformat(data_fim)
        query = query.filter(Venda.criado_em <= datetime.combine(d, datetime.max.time()))
    if categoria:
        query = query.filter(Venda.categoria == categoria)
    vendas = query.order_by(Venda.criado_em.desc()).limit(limit).all()
    return [fmt_venda(v) for v in vendas]


@router.post("/", response_model=VendaOut, status_code=201)
def registrar_venda(data: RegistrarVendaInput, db: Session = Depends(get_db)):
    sessao = db.query(SessaoCaixa).filter(SessaoCaixa.status == "aberto").first()
    sessao_id = sessao.id if sessao else None

    subtotal = sum(i.quantidade * i.preco_unit for i in data.itens)
    total = max(0, subtotal - (data.desconto or 0))

    venda = Venda(
        sessao_id=sessao_id,
        categoria=data.categoria,
        total=total,
        desconto=data.desconto or 0,
        pagamento=data.pagamento,
        cliente_id=data.cliente_id,
        observacao=data.observacao,
    )
    db.add(venda)
    db.flush()

    for item in data.itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if not produto:
            continue
        nome_snap = f"{produto.nome} - {produto.marca}" if produto.marca else produto.nome
        iv = ItemVenda(
            venda_id=venda.id,
            produto_id=item.produto_id,
            nome_snap=nome_snap,
            quantidade=item.quantidade,
            preco_unit=item.preco_unit,
            subtotal=item.quantidade * item.preco_unit,
        )
        db.add(iv)
        produto.estoque = produto.estoque - item.quantidade

    if data.pagamento == "fiado" and data.cliente_id:
        fiado = Fiado(cliente_id=data.cliente_id, venda_id=venda.id, valor=total)
        db.add(fiado)

    if sessao:
        if data.pagamento == "dinheiro":
            sessao.total_dinheiro += total
        elif data.pagamento == "pix":
            sessao.total_pix += total
        elif data.pagamento == "cartao":
            sessao.total_cartao += total
        elif data.pagamento == "fiado":
            sessao.total_fiado += total

    db.commit()
    db.refresh(venda)

    cliente_nome = None
    if venda.cliente_id:
        c = db.query(Cliente).filter(Cliente.id == venda.cliente_id).first()
        cliente_nome = c.nome if c else None

    return fmt_venda(venda, cliente_nome)
