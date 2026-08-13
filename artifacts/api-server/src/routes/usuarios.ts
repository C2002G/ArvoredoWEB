import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usuariosTable, vendasTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm"; 
import { hashSenha, verificarSenha } from "../lib/senha";

const router: IRouter = Router();

function iniciais(nome: string, sobrenome?: string | null): string {
  const i1 = nome.trim()[0] ?? "";
  const i2 = sobrenome?.trim()[0] ?? "";
  return (i1 + i2).toUpperCase();
}

router.get("/resumo", async (_req, res) => {
  const usuarios = await db.select().from(usuariosTable);

  const totais = await db
    .select({
      operador_id: vendasTable.operador_id,
      total: sql<number>`sum(${vendasTable.total})`.as("total"),
      qtd: sql<number>`count(*)`.as("qtd"),
    })
    .from(vendasTable)
    .where(sql`${vendasTable.operador_id} is not null`)
    .groupBy(vendasTable.operador_id);

  const totaisPorUsuario = new Map(totais.map((t) => [t.operador_id, t]));

  res.json(
    usuarios.map((u) => {
      const { senha_hash, ...resto } = u;
      const t = totaisPorUsuario.get(u.id);
      return {
        ...resto,
        iniciais: iniciais(u.nome, u.sobrenome),
        criado_em: u.criado_em.toISOString(),
        total_vendido: t?.total ?? 0,
        qtd_vendas: t?.qtd ?? 0,
      };
    }),
  );
});

// Lista usuarios ativos (sem senha) — usado na tela de troca
router.get("/", async (_req, res) => {
  const usuarios = await db.select().from(usuariosTable).where(eq(usuariosTable.ativo, true));
  res.json(
    usuarios.map(({ senha_hash, ...u }) => ({
      ...u,
      iniciais: iniciais(u.nome, u.sobrenome),
      criado_em: u.criado_em.toISOString(),
    })),
  );
});

router.post("/", async (req, res) => {
  const { nome, sobrenome, usuario, senha, cor } = req.body as {
    nome: string; sobrenome?: string; usuario: string; senha: string; cor?: string;
  };
  if (!nome?.trim() || !usuario?.trim() || !senha) {
    res.status(400).json({ ok: false, message: "nome, usuario e senha sao obrigatorios" });
    return;
  }

  const [criado] = await db.insert(usuariosTable).values({
    nome: nome.trim(),
    sobrenome: sobrenome?.trim() || null,
    usuario: usuario.trim().toLowerCase(),
    senha_hash: hashSenha(senha),
    cor: cor || "#3b82f6",
  }).returning();

  const { senha_hash, ...resto } = criado;
  res.status(201).json({ ...resto, iniciais: iniciais(criado.nome, criado.sobrenome), criado_em: criado.criado_em.toISOString() });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nome, sobrenome, cor, ativo, senha } = req.body as {
    nome?: string; sobrenome?: string; cor?: string; ativo?: boolean; senha?: string;
  };

  const updates: Record<string, unknown> = {};
  if (nome !== undefined) updates.nome = nome;
  if (sobrenome !== undefined) updates.sobrenome = sobrenome;
  if (cor !== undefined) updates.cor = cor;
  if (ativo !== undefined) updates.ativo = ativo;
  if (senha) updates.senha_hash = hashSenha(senha);

  const [usuario] = await db.update(usuariosTable).set(updates).where(eq(usuariosTable.id, id)).returning();
  if (!usuario) {
    res.status(404).json({ ok: false, message: "Usuario nao encontrado" });
    return;
  }
  const { senha_hash, ...resto } = usuario;
  res.json({ ...resto, iniciais: iniciais(usuario.nome, usuario.sobrenome), criado_em: usuario.criado_em.toISOString() });
});

router.post("/login", async (req, res) => {
  const { usuario, senha } = req.body as { usuario: string; senha: string };
  if (!usuario?.trim() || !senha) {
    res.status(400).json({ ok: false, message: "usuario e senha sao obrigatorios" });
    return;
  }

  const [encontrado] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.usuario, usuario.trim().toLowerCase()));

  if (!encontrado || !encontrado.ativo || !verificarSenha(senha, encontrado.senha_hash)) {
    res.status(401).json({ ok: false, message: "Usuario ou senha invalidos" });
    return;
  }

  const { senha_hash, ...resto } = encontrado;
  res.json({
    ok: true,
    usuario: { ...resto, iniciais: iniciais(encontrado.nome, encontrado.sobrenome), criado_em: encontrado.criado_em.toISOString() },
  });
});

export default router;