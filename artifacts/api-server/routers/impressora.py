"""Rotas da Impressora Elgin I9 (ESC/POS via python-escpos)."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Venda, ItemVenda, Cliente

router = APIRouter()

# VID/PID da Elgin I9 (USB)
ELGIN_I9_VID = 0x0483
ELGIN_I9_PID = 0x5743

CABECALHO = """================================
       MERCADO ARVOREDO
      60.242.783/0001-41
    R. Cel. Fernando Machado, 
     453 - Centro Histórico, 
   Porto Alegre - RS, 90010-321
       Tel: (51) 996204850
================================"""

RODAPE = """================================
   Obrigado pela preferência!
================================"""


def _get_printer():
    """Retorna impressora ESC/POS ou None se não encontrada."""
    try:
        from escpos.printer import Usb
        p = Usb(ELGIN_I9_VID, ELGIN_I9_PID, timeout=0, profile="default")
        return p
    except Exception:
        return None


def _formatar_linha(nome: str, qtd: float, unit: float, total: float, col_total: int = 32) -> str:
    """Formata uma linha de item para o cupom (32 cols)."""
    qtd_str = f"{qtd:g}"
    unit_str = f"{unit:.2f}"
    total_str = f"{total:.2f}"
    # nome pode ocupar até 16 chars
    nome_fmt = nome[:16].ljust(16)
    qtd_fmt = qtd_str.rjust(3)
    unit_fmt = unit_str.rjust(5)
    total_fmt = total_str.rjust(5)
    return f"{nome_fmt} {qtd_fmt} {unit_fmt} {total_fmt}"


def _cupom_texto(venda: Venda, itens: list) -> str:
    """Monta texto completo do cupom."""
    dt = venda.criado_em or datetime.utcnow()
    data_str = dt.strftime("%d/%m/%Y")
    hora_str = dt.strftime("%H:%M")
    cat = "MERCADO" if venda.categoria == "mercado" else "COZINHA"
    pag = venda.pagamento.upper()

    linhas = [
        CABECALHO,
        "         CUPOM FISCAL",
        "================================",
        f"Data: {data_str}  Hora: {hora_str}",
        f"Nº Venda: #{venda.id:03d}",
        f"Categoria: {cat}",
        "--------------------------------",
        "ITEM           QTD   UNIT  TOTAL",
        "--------------------------------",
    ]

    for item in itens:
        linhas.append(_formatar_linha(item.nome_snap, item.quantidade, item.preco_unit, item.subtotal))

    linhas += [
        "--------------------------------",
        f"Desconto:            -R$ {venda.desconto:.2f}",
        f"TOTAL:               R$ {venda.total:.2f}",
        "================================",
        f"Pagamento: {pag}",
        RODAPE,
    ]

    if venda.cliente_id and venda.pagamento == "fiado" and venda.cliente:
        linhas.insert(-2, f"Cliente: {venda.cliente.nome}")

    return "\n".join(linhas) + "\n\n\n"


def _relatorio_sangria_texto(vendas: list, data_inicio: str, data_fim: str) -> str:
    """Monta texto do relatório de sangria."""
    linhas = [
        "================================",
        "       MERCADO ARVOREDO",
        "   RELATÓRIO DE VENDAS / SANGRIA",
        "================================",
        f"Período: {data_inicio} a {data_fim}",
        "--------------------------------",
        "ID   DATA      PAGT   TOTAL",
        "--------------------------------",
    ]

    total_geral = 0.0
    for v in vendas:
        dt = v.criado_em.strftime("%d/%m") if v.criado_em else "??"
        pag = v.pagamento[:4].upper()
        linha = f"#{v.id:<4} {dt}  {pag:<6} R${v.total:>7.2f}"
        linhas.append(linha)
        total_geral += v.total

    linhas += [
        "--------------------------------",
        f"TOTAL GERAL:    R$ {total_geral:.2f}",
        "================================",
        "",
        "",
        "",
    ]
    return "\n".join(linhas)


@router.post("/cupom")
def imprimir_cupom(data: dict, db: Session = Depends(get_db)):
    venda_id = data.get("venda_id")
    venda = db.query(Venda).filter(Venda.id == venda_id).first()
    if not venda:
        return {"ok": False, "erro": "Venda não encontrada"}

    itens = db.query(ItemVenda).filter(ItemVenda.venda_id == venda_id).all()
    texto = _cupom_texto(venda, itens)

    printer = _get_printer()
    if printer is None:
        # Sem impressora física: retorna o texto para o frontend simular
        return {"ok": True, "texto": texto, "simulado": True}

    try:
        printer.text(texto)
        printer.cut()
        return {"ok": True, "simulado": False}
    except Exception as e:
        return {"ok": False, "erro": str(e)}
    finally:
        try:
            printer.close()
        except Exception:
            pass


@router.post("/sangria")
def imprimir_sangria(data: dict, db: Session = Depends(get_db)):
    data_inicio = data.get("data_inicio")
    data_fim = data.get("data_fim")
    sessao_id = data.get("sessao_id")

    try:
        d_inicio = datetime.combine(date.fromisoformat(data_inicio), datetime.min.time())
        d_fim = datetime.combine(date.fromisoformat(data_fim), datetime.max.time())
    except Exception:
        return {"ok": False, "erro": "Datas inválidas (use YYYY-MM-DD)"}

    query = db.query(Venda).filter(Venda.criado_em >= d_inicio, Venda.criado_em <= d_fim)
    if sessao_id:
        query = query.filter(Venda.sessao_id == sessao_id)
    vendas = query.order_by(Venda.criado_em).all()

    texto = _relatorio_sangria_texto(vendas, data_inicio, data_fim)

    printer = _get_printer()
    if printer is None:
        return {"ok": True, "texto": texto, "simulado": True}

    try:
        printer.text(texto)
        printer.cut()
        return {"ok": True, "simulado": False}
    except Exception as e:
        return {"ok": False, "erro": str(e)}
    finally:
        try:
            printer.close()
        except Exception:
            pass


@router.post("/teste")
def test_impressora():
    printer = _get_printer()
    if printer is None:
        return {"ok": False, "erro": "Impressora Elgin I9 não encontrada (VID:0483 PID:5743)"}
    try:
        printer.text("TESTE ARVOREDO PDV\n\n\n")
        printer.cut()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "erro": str(e)}
    finally:
        try:
            printer.close()
        except Exception:
            pass
