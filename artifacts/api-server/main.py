"""
Arvoredo PDV - Backend Principal (FastAPI + Python)
Execute: python main.py  ou  uvicorn main:app --reload --port 8080
"""
import os
import sys

# Permite rodar de qualquer diretório
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routers import produtos, vendas, estoque, fiado, caixa, impressora

# Criar tabelas e migrar schema ao iniciar
def run_migrations():
    """Aplica migrações necessárias no banco."""
    from sqlalchemy import text
    with engine.connect() as conn:
        Base.metadata.create_all(bind=engine)
        # Adiciona colunas novas se ainda não existirem
        migrations = [
            "ALTER TABLE produtos ADD COLUMN IF NOT EXISTS validade VARCHAR;",
            "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS apelido VARCHAR;",
            "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf VARCHAR;",
        ]
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                conn.rollback()

run_migrations()

app = FastAPI(title="Arvoredo PDV", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/api/healthz")
def health():
    return {"status": "ok"}

# Routers
app.include_router(produtos.router, prefix="/api/produtos", tags=["produtos"])
app.include_router(vendas.router, prefix="/api/vendas", tags=["vendas"])
app.include_router(estoque.router, prefix="/api/estoque", tags=["estoque"])
app.include_router(fiado.router, prefix="/api/fiado", tags=["fiado"])
app.include_router(caixa.router, prefix="/api/caixa", tags=["caixa"])
app.include_router(impressora.router, prefix="/api/impressora", tags=["impressora"])

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
