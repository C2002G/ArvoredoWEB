import { db } from "@workspace/db";
import { configFiscalTable, nfceLogsTable, Venda, ItemVenda, Produto, Cliente } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { XMLBuilder } from "fast-xml-parser";

async function getFiscalConfig() {
  const [config] = await db.select().from(configFiscalTable).limit(1);
  if (!config) throw new Error("Configuração fiscal não encontrada no banco de dados.");
  return config;
}

function gerarCodigoNumerico(venda: Venda, dataEmi: Date) {
  const nNF9 = String(venda.id).padStart(9, "0");
  const nNF8 = nNF9.slice(-8);
  const seed = Number(`${venda.id}${dataEmi.getTime()}`.slice(-12));
  let cNF = String(seed % 100_000_000).padStart(8, "0");
  if (cNF === nNF8) {
    cNF = String((Number(cNF) + 1) % 100_000_000).padStart(8, "0");
  }
  return cNF;
}

// Gera o DV Modulo 11 e a Chave de 44 digitos
function gerarChaveAcesso(config: any, venda: Venda, dataEmi: Date) {
  const cUF = "43"; // 43 = RS
  const AAMM = dataEmi.toISOString().substring(2, 7).replace("-", "");
  const CNPJ = config.cnpj.replace(/\D/g, "").padStart(14, "0");
  const mod = "65"; // NFC-e
  const serie = "001";
  const nNF = String(venda.id).padStart(9, "0");
  const tpEmis = "1"; // Normal
  const cNF = gerarCodigoNumerico(venda, dataEmi);
  const chaveSemDV = `${cUF}${AAMM}${CNPJ}${mod}${serie}${nNF}${tpEmis}${cNF}`;

  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += parseInt(chaveSemDV[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return `${chaveSemDV}${dv}`;
}

function resolveUniNFeBaseDir(cnpjNumerico: string) {
  const configuredDir = process.env.UNINFE_DIR;
  const candidates = [
    configuredDir,
    "C:\\Unimake\\UniNFe",
    "C:\\UniNFe",
  ].filter((v): v is string => Boolean(v && v.trim()));

  for (const baseDir of candidates) {
    const pastaEnvio = path.join(baseDir, cnpjNumerico, "Envio");
    if (existsSync(pastaEnvio)) {
      return baseDir;
    }
  }

  return configuredDir || "C:\\UniNFe";
}

function formatarDhEmi(data: Date) {
  const options = { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false } as const;
  const parts = new Intl.DateTimeFormat("pt-BR", options).formatToParts(data);
  const getP = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${getP("year")}-${getP("month")}-${getP("day")}T${getP("hour")}:${getP("minute")}:${getP("second")}-03:00`;
}

async function buscarResultadoEmProRec(pastaRetorno: string, chaveAcesso: string) {
  try {
    const arquivos = await fs.readdir(pastaRetorno);
    const candidatos = arquivos.filter((nome) => nome.endsWith("-pro-rec.xml"));
    for (const nome of candidatos) {
      const conteudo = await fs.readFile(path.join(pastaRetorno, nome), "utf8");
      if (!conteudo.includes(chaveAcesso)) continue;
      const stats = [...conteudo.matchAll(/<cStat>(\d+)<\/cStat>/g)].map((m) => m[1]);
      const motivos = [...conteudo.matchAll(/<xMotivo>([^<]+)<\/xMotivo>/g)].map((m) => m[1]);
      const stat = stats.at(-1);
      const motivo = motivos.at(-1);
      if (stat === "100") {
        return { autorizada: true, xml: conteudo };
      }
      if (stat) {
        return { rejeitada: true, mensagem: `[${stat}] ${motivo || "Rejeicao sem motivo detalhado"}` };
      }
      return { rejeitada: false };
    }
  } catch {
    // Ignora erro de leitura temporario de arquivos em processamento.
  }
  return null;
}

async function buscarArquivoAutorizadoPorChave(pastaRetorno: string, chaveAcesso: string) {
  try {
    const arquivos = await fs.readdir(pastaRetorno);
    const candidatos = arquivos.filter(
      (nome) =>
        nome.toLowerCase().endsWith(".xml") &&
        (nome.includes(chaveAcesso) || nome.toLowerCase().includes("proc")),
    );
    for (const nome of candidatos) {
      const conteudo = await fs.readFile(path.join(pastaRetorno, nome), "utf8");
      if (!conteudo.includes(chaveAcesso)) continue;
      if (conteudo.includes("<protNFe") && /<cStat>\s*100\s*<\/cStat>/.test(conteudo)) {
        return conteudo;
      }
    }
  } catch {
    // Ignora erros transitórios de leitura.
  }
  return "";
}

export async function emitirNfce(
  venda: Venda,
  itens: ItemVenda[],
  produtos: Produto[],
  cliente?: Cliente | null,
) {
  const config = await getFiscalConfig();
  const [log] = await db.insert(nfceLogsTable).values({
    venda_id: venda.id,
    ambiente: config.ambiente,
    status: "processando",
  }).returning();

  try {
    const cnpjNumerico = config.cnpj.replace(/\D/g, "");
    if (cnpjNumerico.length !== 14 || /^0+$/.test(cnpjNumerico)) {
      throw new Error(
        `CNPJ fiscal invalido em config_fiscal (${config.cnpj}). Corrija o cadastro fiscal antes de emitir NFC-e.`,
      );
    }
    const uninfeDir = resolveUniNFeBaseDir(cnpjNumerico);
    const pastaEnvio = path.join(uninfeDir, cnpjNumerico, "Envio");
    const pastaRetorno = path.join(uninfeDir, cnpjNumerico, "Retorno");

    if (!existsSync(pastaEnvio)) {
      throw new Error(`Pasta de envio do UniNFe não encontrada em ${pastaEnvio}. Venda salva localmente.`);
    }

    const dataEmi = new Date();
    const chaveAcesso = gerarChaveAcesso(config, venda, dataEmi);
    const cpfMatch = (venda.observacao || "").match(/CPF_NA_NOTA:(\d{11})/);
    const cpfDestinatario = cpfMatch?.[1] || cliente?.cpf;

    const nfeObj = {
      NFe: {
        "@_xmlns": "http://www.portalfiscal.inf.br/nfe",
        infNFe: {
          "@_versao": "4.00",
          "@_Id": `NFe${chaveAcesso}`,
          ide: {
            cUF: "43",
            cNF: chaveAcesso.substring(35, 43),
            natOp: "VENDA PRESENCIAL",
            mod: "65",
            serie: "1",
            nNF: String(venda.id),
            dhEmi: formatarDhEmi(dataEmi),
            tpNF: "1",
            idDest: "1",
            cMunFG: config.cod_municipio,
            tpImp: "4",
            tpEmis: "1",
            cDV: chaveAcesso.substring(43, 44),
            tpAmb: config.ambiente === "homologacao" ? "2" : "1",
            finNFe: "1",
            indFinal: "1",
            indPres: "1",
            procEmi: "0",
            verProc: "ArvoredoPDV 1.0",
          },
          emit: {
            CNPJ: config.cnpj.replace(/\D/g, ""),
            xNome: config.razao_social,
            xFant: config.nome_fantasia,
            enderEmit: {
              xLgr: config.endereco,
              nro: config.numero,
              xBairro: config.bairro,
              cMun: config.cod_municipio,
              xMun: config.cidade,
              UF: config.uf,
              CEP: config.cep.replace(/\D/g, ""),
              cPais: "1058",
              xPais: "Brasil",
            },
            IE: config.ie.replace(/\D/g, ""),
            CRT: config.crt,
          },
          ...(cpfDestinatario ? {
            dest: {
              CPF: cpfDestinatario.replace(/\D/g, ""),
              xNome: cliente?.nome || "CONSUMIDOR",
              indIEDest: "9",
            },
          } : {}),
          det: itens.map((item, index) => {
            const p = produtos.find((x) => x.id === item.produto_id);
            return {
              "@_nItem": String(index + 1),
              prod: {
                cProd: String(item.produto_id),
                cEAN: p?.codigo || "SEM GTIN",
                xProd:
                  config.ambiente === "homologacao" && index === 0
                    ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
                    : item.nome_snap,
                NCM: p?.ncm || "00000000",
                CFOP: p?.cfop || "5102",
                uCom: p?.unidade || "UN",
                qCom: item.quantidade.toFixed(4),
                vUnCom: item.preco_unit.toFixed(4),
                vProd: item.subtotal.toFixed(2),
                cEANTrib: p?.codigo || "SEM GTIN",
                uTrib: p?.unidade || "UN",
                qTrib: item.quantidade.toFixed(4),
                vUnTrib: item.preco_unit.toFixed(4),
                indTot: "1",
              },
              imposto: {
                ICMS: { ICMSSN102: { orig: "0", CSOSN: p?.cst || "102" } },
                PIS: { PISOutr: { CST: "99", vBC: "0.00", pPIS: "0.00", vPIS: "0.00" } },
                COFINS: { COFINSOutr: { CST: "99", vBC: "0.00", pCOFINS: "0.00", vCOFINS: "0.00" } },
              },
            };
          }),
          total: {
            ICMSTot: {
              vBC: "0.00", vICMS: "0.00", vICMSDeson: "0.00", vFCP: "0.00",
              vBCST: "0.00", vST: "0.00", vFCPST: "0.00", vFCPSTRet: "0.00",
              vProd: venda.total.toFixed(2), vFrete: "0.00", vSeg: "0.00",
              vDesc: venda.desconto.toFixed(2), vII: "0.00", vIPI: "0.00",
              vIPIDevol: "0.00", vPIS: "0.00", vCOFINS: "0.00", vOutro: "0.00",
              vNF: (venda.total - venda.desconto).toFixed(2),
            },
          },
          transp: {
            modFrete: "9",
          },
          pag: {
            detPag: [{
              tPag: venda.pagamento === "dinheiro" ? "01" : venda.pagamento === "pix" ? "17" : (venda.pagamento === "cartao" ? "03" : "99"),
              vPag: (venda.total - venda.desconto).toFixed(2),
              ...(venda.pagamento === "cartao" ? { card: { tpIntegra: "2" } } : {}),
            }],
          },
        },
      },
    };

    const builder = new XMLBuilder({ ignoreAttributes: false, format: true, attributeNamePrefix: "@_" });
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(nfeObj)}`;

    const nomeArquivo = `${chaveAcesso}-nfe.xml`;
    await fs.writeFile(path.join(pastaEnvio, nomeArquivo), xmlContent, "utf8");

    // Polling configurável para aguardar retorno do UniNFe.
    // Em algumas instalações o retorno pode passar de 15s.
    const arquivoAutorizado = path.join(pastaRetorno, `${chaveAcesso}-procNFe.xml`);
    const arquivoErro = path.join(pastaRetorno, `${chaveAcesso}-nfe.err`);
    const intervaloMs = Number(process.env.NFCE_POLL_INTERVAL_MS || "1000");
    const tentativas = Number(process.env.NFCE_POLL_RETRIES || "120");

    let retries = Number.isFinite(tentativas) && tentativas > 0 ? tentativas : 120;
    let autorizadoXML = "";
    let erroTXT = "";

    while (retries > 0) {
      await new Promise((r) => setTimeout(r, intervaloMs));
      try {
        if (existsSync(arquivoAutorizado)) {
          autorizadoXML = await fs.readFile(arquivoAutorizado, "utf8");
          break;
        }
        if (existsSync(arquivoErro)) {
          erroTXT = await fs.readFile(arquivoErro, "utf8");
          break;
        }
        const resultadoProRec = await buscarResultadoEmProRec(pastaRetorno, chaveAcesso);
        if (resultadoProRec?.autorizada && resultadoProRec.xml) {
          autorizadoXML = resultadoProRec.xml;
          break;
        }
        if (resultadoProRec?.rejeitada) {
          erroTXT = resultadoProRec.mensagem || "Rejeicao retornada em arquivo pro-rec.xml";
          break;
        }
        const xmlGenerico = await buscarArquivoAutorizadoPorChave(pastaRetorno, chaveAcesso);
        if (xmlGenerico) {
          autorizadoXML = xmlGenerico;
          break;
        }
      } catch (e) { }
      retries--;
    }

    if (erroTXT) throw new Error(`Rejeição da Sefaz: ${erroTXT}`);
    if (!autorizadoXML) {
      const tempoTotalSeg = Math.round((tentativas * intervaloMs) / 1000);
      throw new Error(`UniNFe não respondeu a tempo (${tempoTotalSeg}s).`);
    }

    await db.update(nfceLogsTable).set({
      status: "autorizada",
      chave_acesso: chaveAcesso,
      xml_autorizado: autorizadoXML,
    }).where(eq(nfceLogsTable.id, log.id));

    // Para impressão, extraímos o QR Code retornado pelo XML processado
    const matchQr = autorizadoXML.match(/<qrCode[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/qrCode>/i);
    const qrCodeUrl = matchQr ? matchQr[1].trim() : "";

    return { success: true, status: "autorizada", xmlAutorizado: autorizadoXML, chaveAcesso, qrCodeUrl };
  } catch (error: any) {
    await db.update(nfceLogsTable).set({
      status: "erro",
      mensagem_status_sefaz: error.message,
    }).where(eq(nfceLogsTable.id, log.id));

    return { success: false, status: "erro", mensagem: error.message };
  }
}