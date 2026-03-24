"""Rotas de Estoque."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Produto, MovimentoEstoque
from schemas import MovimentoEstoqueInput, MovimentoEstoqueOut

router = APIRouter()


@router.post("/movimento", response_model=MovimentoEstoqueOut, status_code=201)
def movimentar_estoque(data: MovimentoEstoqueInput, db: Session = Depends(get_db)):
    produto = db.query(Produto).filter(Produto.id == data.produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    if data.tipo == "entrada":
        produto.estoque += data.quantidade
    elif data.tipo == "saida":
        produto.estoque -= data.quantidade
    elif data.tipo == "ajuste":
        produto.estoque = data.quantidade

    mov = MovimentoEstoque(
        produto_id=data.produto_id,
        tipo=data.tipo,
        quantidade=data.quantidade,
        motivo=data.motivo,
    )
    db.add(mov)
    db.commit()
    db.refresh(mov)

    nome = f"{produto.nome} - {produto.marca}" if produto.marca else produto.nome
    return {
        "id": mov.id,
        "produto_id": mov.produto_id,
        "produto_nome": nome,
        "tipo": mov.tipo,
        "quantidade": mov.quantidade,
        "motivo": mov.motivo,
        "criado_em": mov.criado_em.isoformat(),
    }


@router.get("/movimentos", response_model=List[MovimentoEstoqueOut])
def listar_movimentos(produto_id: Optional[int] = None, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(MovimentoEstoque)
    if produto_id:
        query = query.filter(MovimentoEstoque.produto_id == produto_id)
    movimentos = query.order_by(MovimentoEstoque.criado_em.desc()).limit(limit).all()
    result = []
    for m in movimentos:
        nome = None
        if m.produto:
            nome = f"{m.produto.nome} - {m.produto.marca}" if m.produto.marca else m.produto.nome
        result.append({
            "id": m.id,
            "produto_id": m.produto_id,
            "produto_nome": nome,
            "tipo": m.tipo,
            "quantidade": m.quantidade,
            "motivo": m.motivo,
            "criado_em": m.criado_em.isoformat(),
        })
    return result
