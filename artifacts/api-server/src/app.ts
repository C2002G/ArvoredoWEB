import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === "23505") {
    const detail = err?.detail || err?.message || "Registro duplicado";
    res.status(409).json({ ok: false, message: `Registro duplicado: ${detail}` });
    return;
  }
  if (err?.code === "23502") {
    const column = err?.column || "desconhecida";
    res.status(400).json({ ok: false, message: `Campo obrigatorio ausente: coluna "${column}"` });
    return;
  }
  if (err?.code === "23503") {
    const detail = err?.detail || err?.message || "Referencia invalida";
    res.status(400).json({ ok: false, message: `Referencia invalida: ${detail}` });
    return;
  }
  if (err?.name === "ZodError") {
    res.status(400).json({
      ok: false,
      message: "Dados invalidos",
      errors: err.errors?.map((e: any) => `${e.path.join(".")}: ${e.message}`),
    });
    return;
  }
  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({ ok: false, message: err?.message || "Erro interno do servidor" });
});

export default app;
