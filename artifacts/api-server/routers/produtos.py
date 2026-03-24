"""Rotas de Produtos."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Produto
from schemas import CriarProdutoInput, EditarProdutoInput, ProdutoOut, AlertasProdutosOut

router = APIRouter()


def fmt_produto(p: Produto) -> dict:
    return {
        "id": p.id,
        "codigo": p.codigo,
        "nome": p.nome,
        "marca": p.marca,
        "categoria": p.categoria,
        "preco": p.preco,
        "custo": p.custo,
        "estoque": p.estoque,
        "estoque_min": p.estoque_min,
        "unidade": p.unidade,
        "validade": p.validade,
        "ativo": p.ativo,
        "criado_em": p.criado_em.isoformat() if p.criado_em else None,
    }


@router.get("/", response_model=List[ProdutoOut])
def listar_produtos(q: Optional[str] = None, categoria: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Produto).filter(Produto.ativo == True)
    if categoria in ("mercado", "cozinha"):
        query = query.filter(Produto.categoria == categoria)
    if q:
        query = query.filter(
            (Produto.nome.ilike(f"%{q}%")) | (Produto.marca.ilike(f"%{q}%"))
        )
    produtos = query.order_by(Produto.nome).all()
    return [fmt_produto(p) for p in produtos]


@router.get("/busca", response_model=List[ProdutoOut])
def buscar_produto(codigo: Optional[str] = None, nome: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Produto).filter(Produto.ativo == True)
    busca = q or nome
    if codigo:
        query = query.filter(Produto.codigo == codigo)
    elif busca:
        query = query.filter(
            (Produto.nome.ilike(f"%{busca}%")) | (Produto.marca.ilike(f"%{busca}%"))
        )
    return [fmt_produto(p) for p in query.all()]


@router.get("/alertas", response_model=AlertasProdutosOut)
def alertas_estoque(db: Session = Depends(get_db)):
    hoje = date.today()
    em_7_dias = hoje + timedelta(days=7)

    ativos = db.query(Produto).filter(Produto.ativo == True).all()

    estoque_baixo = [p for p in ativos if p.estoque <= p.estoque_min]
    vencendo = [p for p in ativos if p.validade and hoje <= date.fromisoformat(p.validade) <= em_7_dias]
    vencidos = [p for p in ativos if p.validade and date.fromisoformat(p.validade) < hoje]

    total = len(set([p.id for p in estoque_baixo + vencendo + vencidos]))

    return {
        "estoque_baixo": [fmt_produto(p) for p in estoque_baixo],
        "vencendo": [fmt_produto(p) for p in vencendo],
        "vencidos": [fmt_produto(p) for p in vencidos],
        "total_alertas": total,
    }


@router.post("/", response_model=ProdutoOut, status_code=201)
def criar_produto(data: CriarProdutoInput, db: Session = Depends(get_db)):
    produto = Produto(**data.model_dump())
    db.add(produto)
    db.commit()
    db.refresh(produto)
    return fmt_produto(produto)


@router.put("/{id}", response_model=ProdutoOut)
def editar_produto(id: int, data: EditarProdutoInput, db: Session = Depends(get_db)):
    produto = db.query(Produto).filter(Produto.id == id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(produto, campo, valor)
    db.commit()
    db.refresh(produto)
    return fmt_produto(produto)


@router.delete("/{id}")
def deletar_produto(id: int, db: Session = Depends(get_db)):
    produto = db.query(Produto).filter(Produto.id == id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    produto.ativo = False
    db.commit()
    return {"ok": True, "message": "Produto desativado"}
