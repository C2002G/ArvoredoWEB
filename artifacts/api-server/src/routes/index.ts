import { Router, type IRouter } from "express";
import healthRouter from "./health";
import produtosRouter from "./produtos";
import vendasRouter from "./vendas";
import estoqueRouter from "./estoque";
import fiadoRouter from "./fiado";
import caixaRouter from "./caixa";
import maquininhaRouter from "./maquininha";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/produtos", produtosRouter);
router.use("/vendas", vendasRouter);
router.use("/estoque", estoqueRouter);
router.use("/fiado", fiadoRouter);
router.use("/caixa", caixaRouter);
router.use("/maquininha", maquininhaRouter);

export default router;
