"""Rotas de Fiado."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Cliente, Fiado
from schemas import CriarClienteInput, ClienteOut, ExtratoClienteOut, PagarFiadoInput, ResumoFiadoOut

router = APIRouter()


def fmt_cliente(c: Cliente) -> dict:
    return {
        "id": c.id,
        "nome": c.nome,
        "apelido": c.apelido,
        "telefone": c.telefone,
        "cpf": c.cpf,
        "observacao": c.observacao,
        "criado_em": c.criado_em.isoformat() if c.criado_em else None,
    }


@router.get("/clientes", response_model=List[ClienteOut])
def listar_clientes(q: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Cliente)
    if q:
        query = query.filter(
            (Cliente.nome.ilike(f"%{q}%")) |
            (Cliente.apelido.ilike(f"%{q}%")) |
            (Cliente.cpf.ilike(f"%{q}%"))
        )
    return [fmt_cliente(c) for c in query.order_by(Cliente.nome).all()]


@router.post("/clientes", response_model=ClienteOut, status_code=201)
def criar_cliente(data: CriarClienteInput, db: Session = Depends(get_db)):
    cliente = Cliente(**data.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return fmt_cliente(cliente)


@router.put("/clientes/{id}", response_model=ClienteOut)
def editar_cliente(id: int, data: CriarClienteInput, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    for campo, valor in data.model_dump().items():
        setattr(cliente, campo, valor)
    db.commit()
    db.refresh(cliente)
    return fmt_cliente(cliente)


@router.get("/clientes/{id}/extrato")
def extrato_cliente(id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    fiados = db.query(Fiado).filter(Fiado.cliente_id == id).order_by(Fiado.criado_em).all()
    total_aberto = sum(f.valor for f in fiados if not f.pago)

    return {
        "cliente": fmt_cliente(cliente),
        "fiados": [
            {
                "id": f.id,
                "venda_id": f.venda_id,
                "valor": f.valor,
                "pago": f.pago,
                "pago_em": f.pago_em.isoformat() if f.pago_em else None,
                "criado_em": f.criado_em.isoformat(),
            }
            for f in fiados
        ],
        "total_aberto": total_aberto,
    }


@router.post("/clientes/{id}/pagar")
def pagar_fiado(id: int, data: PagarFiadoInput, db: Session = Depends(get_db)):
    fiados = (
        db.query(Fiado)
        .filter(Fiado.cliente_id == id, Fiado.pago == False)
        .order_by(Fiado.criado_em)
        .all()
    )

    restante = data.valor
    for fiado in fiados:
        if restante <= 0:
            break
        if restante >= fiado.valor:
            fiado.pago = True
            fiado.pago_em = datetime.utcnow()
            restante -= fiado.valor
        else:
            valor_restante = fiado.valor - restante
            fiado.valor = valor_restante
            novo = Fiado(
                cliente_id=id,
                venda_id=fiado.venda_id,
                valor=restante,
                pago=True,
                pago_em=datetime.utcnow(),
            )
            db.add(novo)
            restante = 0

    db.commit()
    return {"ok": True, "message": "Pagamento registrado"}


@router.get("/resumo")
def resumo_fiado(db: Session = Depends(get_db)):
    resultado = (
        db.query(Cliente, func.sum(Fiado.valor).label("total_aberto"))
        .join(Fiado, Fiado.cliente_id == Cliente.id)
        .filter(Fiado.pago == False)
        .group_by(Cliente.id)
        .order_by(func.sum(Fiado.valor).desc())
        .all()
    )
    return [
        {"cliente": fmt_cliente(c), "total_aberto": float(total)}
        for c, total in resultado
    ]
