"""Rotas de Caixa."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import SessaoCaixa, Sangria
from schemas import AbrirCaixaInput, SangriaInput

router = APIRouter()


def fmt_sessao(s: SessaoCaixa) -> dict:
    return {
        "id": s.id,
        "aberto_em": s.aberto_em.isoformat() if s.aberto_em else None,
        "fechado_em": s.fechado_em.isoformat() if s.fechado_em else None,
        "fundo_inicial": s.fundo_inicial,
        "total_dinheiro": s.total_dinheiro,
        "total_pix": s.total_pix,
        "total_cartao": s.total_cartao,
        "total_fiado": s.total_fiado,
        "total_sangria": s.total_sangria,
        "status": s.status,
    }


@router.get("/status")
def status_caixa(db: Session = Depends(get_db)):
    sessao = db.query(SessaoCaixa).filter(SessaoCaixa.status == "aberto").first()
    return {"aberto": sessao is not None, "sessao": fmt_sessao(sessao) if sessao else None}


@router.post("/abrir", status_code=201)
def abrir_caixa(data: AbrirCaixaInput, db: Session = Depends(get_db)):
    existente = db.query(SessaoCaixa).filter(SessaoCaixa.status == "aberto").first()
    if existente:
        raise HTTPException(status_code=400, detail="Já existe um caixa aberto")
    sessao = SessaoCaixa(fundo_inicial=data.fundo_inicial)
    db.add(sessao)
    db.commit()
    db.refresh(sessao)
    return fmt_sessao(sessao)


@router.post("/fechar")
def fechar_caixa(db: Session = Depends(get_db)):
    sessao = db.query(SessaoCaixa).filter(SessaoCaixa.status == "aberto").first()
    if not sessao:
        raise HTTPException(status_code=400, detail="Nenhum caixa aberto")
    sessao.status = "fechado"
    sessao.fechado_em = datetime.utcnow()
    db.commit()
    db.refresh(sessao)
    return fmt_sessao(sessao)


@router.post("/sangria", status_code=201)
def registrar_sangria(data: SangriaInput, db: Session = Depends(get_db)):
    sessao = db.query(SessaoCaixa).filter(SessaoCaixa.status == "aberto").first()
    if not sessao:
        raise HTTPException(status_code=400, detail="Nenhum caixa aberto")
    sangria = Sangria(sessao_id=sessao.id, valor=data.valor, motivo=data.motivo)
    db.add(sangria)
    sessao.total_sangria += data.valor
    db.commit()
    db.refresh(sangria)
    return {
        "id": sangria.id,
        "sessao_id": sangria.sessao_id,
        "valor": sangria.valor,
        "motivo": sangria.motivo,
        "criado_em": sangria.criado_em.isoformat(),
    }


@router.get("/sangrias")
def listar_sangrias(sessao_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Sangria)
    if sessao_id:
        query = query.filter(Sangria.sessao_id == sessao_id)
    sangrias = query.order_by(Sangria.criado_em.desc()).all()
    return [
        {
            "id": s.id,
            "sessao_id": s.sessao_id,
            "valor": s.valor,
            "motivo": s.motivo,
            "criado_em": s.criado_em.isoformat(),
        }
        for s in sangrias
    ]


@router.get("/historico")
def historico_caixa(db: Session = Depends(get_db)):
    sessoes = db.query(SessaoCaixa).order_by(SessaoCaixa.aberto_em.desc()).limit(30).all()
    return [fmt_sessao(s) for s in sessoes]
