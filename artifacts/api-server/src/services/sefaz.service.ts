import { db } from "@workspace/db";
import { configFiscalTable, nfceLogsTable, Venda, ItemVenda, Produto, Cliente } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { XMLBuilder } from "fast-xml-parser";

/**
 * MODO TESTE: Mapeia bandeiras de cartão para códigos aceitos pela SEFAZ
 * Quando um serviço TEF real for integrado, esses dados virão corretamente do terminal
 * Você pode remover esta função quando contratar um serviço TEF
 */
function normalizarBandeira(bandeira?: string | null): string {
  if (!bandeira) return "99"; // código genérico
  
  const normalized = bandeira.toUpperCase().trim();
  
  // Mapping de nomes para códigos SEFAZ
  const bandeiraMap: Record<string, string> = {
    "VISA": "01",
    "MASTERCARD": "02",
    "AMEX": "03",
    "AMERICAN EXPRESS": "03",
    "ELO": "04",
    "DINERS": "05",
    "AURA": "06",
    "DISCOVER": "07",
    "JCB": "08",
    "01": "01",
    "02": "02",
    "03": "03",
    "04": "04",
    "05": "05",
    "06": "06",
    "07": "07",
    "08": "08",
  };
  
  return bandeiraMap[normalized] || normalized;
}

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
  console.log(`[SEFAZ] Código numérico gerado para venda ${venda.id}: cNF=${cNF}, nNF=${nNF9}`);
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
  const chaveCompleta = `${chaveSemDV}${dv}`;
  console.log(`[SEFAZ] Chave de acesso gerada: ${chaveCompleta}`);
  console.log(`[SEFAZ] Componentes: cUF=${cUF}, AAMM=${AAMM}, CNPJ=${CNPJ}, mod=${mod}, serie=${serie}, nNF=${nNF}, tpEmis=${tpEmis}, cNF=${cNF}, DV=${dv}`);
  return chaveCompleta;
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

/**
 * Converte qualquer CST/CSOSN de entrada para um CSOSN válido para
 * empresas do Simples Nacional (CRT=1). Valores aceitos pelo SEFAZ: 102, 103, 300, 400.
 *
 * Tabela de conversão:
 * - CST 00 (tributado integralmente)         → CSOSN 102 (sem retenção ST)
 * - CST 10 (com ST)                          → CSOSN 103 (com ICMSST retido)
 * - CST 20 (com redução de BC)               → CSOSN 102
 * - CST 30 (isento com ST)                   → CSOSN 300 (imune/isento)
 * - CST 40/41/50 (isento/não tributado)      → CSOSN 300
 * - CST 51 (diferimento)                     → CSOSN 102 (mais próximo para SN)
 * - CST 60 (cobrado anteriormente por ST)    → CSOSN 400 (ST cobrada anteriormente)
 * - CST 70 (redução de BC e ST)              → CSOSN 103
 * - CST 90 (outros)                          → CSOSN 102
 * - CSOSN 101 (com crédito de ICMS)          → CSOSN 102 (SN sem crédito genérico)
 * - CSOSN 102 (sem permissão de crédito)     → 102 (mantém)
 * - CSOSN 103 (isenção do ICMS no Simples)   → 103 (mantém)
 * - CSOSN 201 (com ST e crédito)             → 103
 * - CSOSN 202/203 (sem crédito com ST)       → 103
 * - CSOSN 300 (imune)                        → 300 (mantém)
 * - CSOSN 400 (não contribuinte)             → 400 (mantém)
 * - CSOSN 500 (ST cobrada anteriormente)     → CSOSN 400
 * - CSOSN 900 (outros)                       → CSOSN 102
 * - Qualquer outro valor desconhecido        → CSOSN 102 (default seguro)
 */
function normalizarCSOSN(cstRaw: string | null | undefined): string {
  const cst = String(cstRaw || "").replace(/\D/g, "").replace(/^0+/, "") || "0";
  
  const map: Record<string, string> = {
    // CST regime normal → CSOSN Simples Nacional equivalente
    "0": "102",   // CST 00 — tributado integralmente
    "10": "103",  // CST 10 — com substituição tributária
    "20": "102",  // CST 20 — com redução de base de cálculo
    "30": "300",  // CST 30 — isento ou não tributado com ST
    "40": "300",  // CST 40 — isento
    "41": "300",  // CST 41 — não tributado
    "50": "102",  // CST 50 — suspensão
    "51": "102",  // CST 51 — diferimento
    "60": "400",  // CST 60 — cobrado anteriormente por ST
    "70": "103",  // CST 70 — redução de BC e ST
    "90": "102",  // CST 90 — outros
    // CSOSN Simples Nacional
    "101": "102", // com direito a crédito → normaliza para 102
    "102": "102", // sem permissão de crédito → mantém
    "103": "103", // isenção do ICMS → mantém
    "201": "103", // com ST e crédito
    "202": "103", // sem crédito e com ST
    "203": "103", // com cobrança de ST
    "300": "300", // imune → mantém
    "400": "400", // não contribuinte → mantém
    "500": "400", // cobrada anteriormente por ST → 400
    "900": "102", // outros → 102
  };
  
  return map[cst] ?? "102"; // default seguro para Simples Nacional
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
    console.log(`[SEFAZ] Buscando XML autorizado em: ${pastaRetorno}`);
    console.log(`[SEFAZ] Chave de acesso: ${chaveAcesso}`);
    
    const arquivos = await fs.readdir(pastaRetorno);
    console.log(`[SEFAZ] Arquivos encontrados:`, arquivos);
    
    // Filtrar apenas arquivos procNFe.xml
    const procArquivos = arquivos.filter(
      (nome) => nome.toLowerCase().endsWith("-procnfe.xml")
    );
    console.log(`[SEFAZ] Arquivos procNFe encontrados:`, procArquivos);
    
    if (procArquivos.length === 0) {
      console.log(`[SEFAZ] Nenhum arquivo procNFe.xml encontrado`);
      return "";
    }
    
    // PRIMEIRO: Tentar encontrar o arquivo específico pela chave de acesso
    const arquivoEspecifico = procArquivos.find(nome => nome.includes(chaveAcesso));
    if (arquivoEspecifico) {
      console.log(`[SEFAZ] Arquivo específico encontrado pela chave: ${arquivoEspecifico}`);
      const caminhoEspecifico = path.join(pastaRetorno, arquivoEspecifico);
      const conteudoEspecifico = await fs.readFile(caminhoEspecifico, "utf8");
      
      if (conteudoEspecifico.includes("<infNFeSupl>") && conteudoEspecifico.includes("<qrCode>")) {
        console.log(`[SEFAZ] QR Code encontrado no arquivo específico`);
        return conteudoEspecifico;
      } else {
        console.log(`[SEFAZ] Arquivo específico não contém QR Code, buscando alternativas...`);
      }
    } else {
      console.log(`[SEFAZ] Arquivo específico não encontrado para chave: ${chaveAcesso}`);
    }
    
    // SEGUNDO: Se não encontrou o específico ou não tem QR Code, buscar o mais recente
    console.log(`[SEFAZ] Buscando arquivo mais recente como fallback...`);
    
    // Obter arquivos com datas de modificação para encontrar o mais recente
    const arquivosComData = await Promise.all(
      procArquivos.map(async (nome) => {
        const filePath = path.join(pastaRetorno, nome);
        const stats = await fs.stat(filePath);
        return {
          nome,
          dataModificacao: stats.mtime,
          caminho: filePath
        };
      })
    );
    
    // Ordenar por data de modificação (mais recente primeiro)
    arquivosComData.sort((a, b) => b.dataModificacao.getTime() - a.dataModificacao.getTime());
    
    console.log(`[SEFAZ] Arquivo mais recente: ${arquivosComData[0].nome}`);
    
    // Ler o arquivo mais recente
    const conteudo = await fs.readFile(arquivosComData[0].caminho, "utf8");
    console.log(`[SEFAZ] Conteúdo do arquivo mais recente (primeiros 500 chars):`, conteudo.substring(0, 500));
    
    // Verificar se tem QR Code
    if (conteudo.includes("<infNFeSupl>") && conteudo.includes("<qrCode>")) {
      console.log(`[SEFAZ] QR Code encontrado no arquivo mais recente`);
      return conteudo;
    } else {
      console.log(`[SEFAZ] Arquivo mais recente não contém QR Code`);
      
      // Se o mais recente não tiver QR Code, tentar os próximos
      for (let i = 1; i < arquivosComData.length; i++) {
        console.log(`[SEFAZ] Tentando próximo arquivo: ${arquivosComData[i].nome}`);
        const proximoConteudo = await fs.readFile(arquivosComData[i].caminho, "utf8");
        if (proximoConteudo.includes("<infNFeSupl>") && proximoConteudo.includes("<qrCode>")) {
          console.log(`[SEFAZ] QR Code encontrado no arquivo: ${arquivosComData[i].nome}`);
          return proximoConteudo;
        }
      }
    }
    
    console.log(`[SEFAZ] Nenhum arquivo com QR Code encontrado`);
  } catch (error) {
    console.log(`[SEFAZ] Erro ao buscar arquivo:`, error);
  }
  return "";
}

type VendaComCartao = Venda & {
  cnpj_credenciadora?: string | null;
  codigo_autorizacao?: string | null;
  bandeira_cartao?: string | null;
  tipo_pagamento?: string | null;
};

export async function emitirNfce(
  venda: VendaComCartao,
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
    console.log(`[SEFAZ] Chave de acesso gerada para venda ${venda.id}: ${chaveAcesso}`);
    const cpfMatch = (venda.observacao || "").match(/(?:CPF_NA_NOTA|CNPJ_NA_NOTA)\s*:\s*(\d{14}|\d{11})/i);
    const documentoDestinatario = cpfMatch?.[1] || cliente?.cpf;
    
    // Detectar se é CPF (11 dígitos) ou CNPJ (14 dígitos)
    const documentoLimpo = documentoDestinatario?.replace(/\D/g, "") || "";
    const isCnpj = documentoLimpo.length === 14;
    const documentoTag = isCnpj ? "CNPJ" : "CPF";

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
          ...(documentoDestinatario ? {
            dest: {
              [documentoTag]: documentoLimpo,
              xNome: config.ambiente === "homologacao"
                ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
                : (cliente?.nome || "CONSUMIDOR").toUpperCase().slice(0, 60),
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
                ICMS: (() => {
                  const csosn = normalizarCSOSN(p?.cst);
                  // A tag ICMS muda conforme o CSOSN: 102/103 → ICMSSN102, 300 → ICMSSN300, 400 → ICMSSN400
                  const icmsTag =
                    csosn === "300" ? "ICMSSN300"
                    : csosn === "400" ? "ICMSSN400"
                    : "ICMSSN102";
                  return { [icmsTag]: { orig: "0", CSOSN: csosn } };
                })(),
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
              vTotTrib: "0.00",
            },
          },
          transp: {
            modFrete: "9",
          },
          pag: {
            detPag: [{
              tPag: venda.pagamento === "dinheiro"
                ? "01"
                : venda.pagamento === "pix"
                  ? "17"
                  : venda.pagamento === "cartao"
                    ? (venda.tipo_pagamento || "03")
                    : "99",
              vPag: (venda.total - venda.desconto).toFixed(2),
              ...((() => {
                const tPag = venda.pagamento === "dinheiro"
                  ? "01"
                  : venda.pagamento === "pix"
                    ? "17"
                    : venda.pagamento === "cartao"
                      ? (venda.tipo_pagamento || "03")
                      : "99";
                const result: any = {};

                // SEFAZ requires xPag (description) when tPag is 99
                if (tPag === "99") {
                  result.xPag = venda.tipo_pagamento || "Outro meio de pagamento";
                }

                // Incluir dados de cartão sempre que houver informações válidas.
                // Isso permite pagamento em débito/crédito funcionar com o simulador Stone.
                const temDadosCartao = venda.cnpj_credenciadora && venda.codigo_autorizacao;
                if (venda.pagamento === "cartao" && temDadosCartao) {
                  result.card = {
                    tpIntegra: "1",
                    CNPJ: String(venda.cnpj_credenciadora || "").replace(/\D/g, ""),
                    tBand: normalizarBandeira(venda.bandeira_cartao || "99"),
                    cAut: venda.codigo_autorizacao,
                  };
                }

                return result;
              })()),
            }],
          },
        },
      },
    };

    const builder = new XMLBuilder({ ignoreAttributes: false, format: true, attributeNamePrefix: "@_" });
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(nfeObj)}`;

    const nomeArquivo = `${chaveAcesso}-nfe.xml`;
    const caminhoEnvio = path.join(pastaEnvio, nomeArquivo);
    await fs.writeFile(caminhoEnvio, xmlContent, "utf8");
    console.log(`[SEFAZ] XML enviado para UniNFe: ${caminhoEnvio}`);
    console.log(`[SEFAZ] Tamanho do XML: ${xmlContent.length} bytes`);

    // Polling configurável para aguardar retorno do UniNFe.
    // Em algumas instalações o retorno pode passar de 15s.
    const arquivoAutorizado = path.join(pastaRetorno, `${chaveAcesso}-procNFe.xml`);
    const arquivoErro = path.join(pastaRetorno, `${chaveAcesso}-nfe.err`);
    const intervaloMs = Number(process.env.NFCE_POLL_INTERVAL_MS || "1000");
    const tentativas = Number(process.env.NFCE_POLL_RETRIES || "120");

    let retries = Number.isFinite(tentativas) && tentativas > 0 ? tentativas : 120;
    let autorizadoXML = "";
    let erroTXT = "";
    let chaveEncontradaNoXML = "";

    console.log(`[SEFAZ] Iniciando polling por arquivo: ${arquivoAutorizado}`);
    console.log(`[SEFAZ] Tentativas máximas: ${tentativas}, intervalo: ${intervaloMs}ms`);

    while (retries > 0) {
      await new Promise((r) => setTimeout(r, intervaloMs));
      try {
        if (existsSync(arquivoAutorizado)) {
          autorizadoXML = await fs.readFile(arquivoAutorizado, "utf8");
          console.log(`[SEFAZ] Arquivo específico encontrado em Retorno: ${arquivoAutorizado}`);
          break;
        }
        if (existsSync(arquivoErro)) {
          erroTXT = await fs.readFile(arquivoErro, "utf8");
          console.log(`[SEFAZ] Arquivo de erro encontrado: ${arquivoErro}`);
          console.log(`[SEFAZ] Conteúdo do erro: ${erroTXT}`);
          break;
        }
        const resultadoProRec = await buscarResultadoEmProRec(pastaRetorno, chaveAcesso);
        if (resultadoProRec?.autorizada && resultadoProRec.xml) {
          autorizadoXML = resultadoProRec.xml;
          console.log(`[SEFAZ] XML encontrado em pro-rec.xml`);
          break;
        }
        if (resultadoProRec?.rejeitada) {
          erroTXT = resultadoProRec.mensagem || "Rejeicao retornada em arquivo pro-rec.xml";
          break;
        }
        
        // Verificar arquivos na pasta Retorno para debug
        if (retries % 10 === 0) { // A cada 10 tentativas, listar arquivos
          try {
            const arquivosRetorno = await fs.readdir(pastaRetorno);
            const arquivosRelevantes = arquivosRetorno.filter(f => f.includes(chaveAcesso) || f.endsWith(".err"));
            if (arquivosRelevantes.length > 0) {
              console.log(`[SEFAZ] Arquivos relevantes em Retorno (tentativa ${tentativas - retries}):`, arquivosRelevantes);
            }
          } catch (e) {
            // Ignorar erro de leitura
          }
        }
        
        // Tenta buscar na pasta Retorno primeiro
        const xmlGenerico = await buscarArquivoAutorizadoPorChave(pastaRetorno, chaveAcesso);
        if (xmlGenerico) {
          autorizadoXML = xmlGenerico;
          // Extrair chave do XML para verificar se corresponde
          const chaveMatch = xmlGenerico.match(/<chNFe>(\d+)<\/chNFe>/);
          if (chaveMatch) {
            chaveEncontradaNoXML = chaveMatch[1];
            console.log(`[SEFAZ] Chave encontrada no XML: ${chaveEncontradaNoXML}`);
            if (chaveEncontradaNoXML !== chaveAcesso) {
              console.log(`[SEFAZ] ALERTA: Chave do XML (${chaveEncontradaNoXML}) difere da chave gerada (${chaveAcesso})`);
              // Se a chave for diferente, NÃO usar este XML
              console.log(`[SEFAZ] XML ignorado por chave incorreta, continuando polling...`);
              autorizadoXML = ""; // Limpar para continuar buscando
              continue; // Continuar o loop
            }
          }
          break;
        }
        
        // Se não encontrou, tenta na pasta correta dos XML autorizados
        const pastaAutorizados = path.join(pastaRetorno, "..", "Enviado", "Autorizados", new Date().toISOString().slice(0, 7).replace("-", ""));
        try {
          console.log(`[SEFAZ] Tentando buscar em: ${pastaAutorizados}`);
          
          // Verificar se a pasta existe e listar arquivos
          try {
            const arquivosAutorizados = await fs.readdir(pastaAutorizados);
            console.log(`[SEFAZ] Arquivos encontrados em Autorizados:`, arquivosAutorizados.slice(0, 20)); // Mostra só os 20 primeiros
            
            // Procurar especificamente pelo arquivo da chave
            const arquivoEspecifico = arquivosAutorizados.find(nome => nome.includes(chaveAcesso));
            if (arquivoEspecifico) {
              console.log(`[SEFAZ] Arquivo específico encontrado: ${arquivoEspecifico}`);
            } else {
              console.log(`[SEFAZ] Arquivo específico não encontrado para chave: ${chaveAcesso}`);
            }
          } catch (dirError) {
            console.log(`[SEFAZ] Erro ao ler pasta Autorizados:`, dirError);
          }
          
          const xmlAutorizados = await buscarArquivoAutorizadoPorChave(pastaAutorizados, chaveAcesso);
          if (xmlAutorizados) {
            autorizadoXML = xmlAutorizados;
            // Extrair chave do XML para verificar se corresponde
            const chaveMatch = xmlAutorizados.match(/<chNFe>(\d+)<\/chNFe>/);
            if (chaveMatch) {
              chaveEncontradaNoXML = chaveMatch[1];
              console.log(`[SEFAZ] Chave encontrada no XML (Autorizados): ${chaveEncontradaNoXML}`);
              if (chaveEncontradaNoXML !== chaveAcesso) {
                console.log(`[SEFAZ] ALERTA: Chave do XML (${chaveEncontradaNoXML}) difere da chave gerada (${chaveAcesso})`);
                // Se a chave for diferente, NÃO usar este XML
                console.log(`[SEFAZ] XML ignorado por chave incorreta, continuando polling...`);
                autorizadoXML = ""; // Limpar para continuar buscando
                continue; // Continuar o loop
              }
            }
            break;
          }
        } catch (e) {
          console.log("[SEFAZ] Pasta Enviado/Autorizados não encontrada ou sem acesso:", e);
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
    console.log("[SEFAZ] XML completo para análise (primeiros 1500 chars):", autorizadoXML.substring(0, 1500));
    
    // Verificar especificamente pela tag infNFeSupl
    const infNFeSuplMatch = autorizadoXML.match(/<infNFeSupl>[\s\S]*?<\/infNFeSupl>/i);
    if (infNFeSuplMatch) {
      console.log("[SEFAZ] infNFeSupl encontrado:", infNFeSuplMatch[0]);
    } else {
      console.log("[SEFAZ] infNFeSupl NÃO encontrado no XML");
    }
    
    // Padrões corrigidos para encontrar o QR Code correto no XML
    const regexPatterns = [
      // Padrão específico para QR Code em infNFeSupl (formato real do XML)
      /<infNFeSupl>[\s\S]*?<qrCode[^>]*>(?:<!\[CDATA\[)?(https?:\/\/www\.sefaz\.rs\.gov\.br\/[^<\]]+)(?:\]\]>)?<\/qrCode>/i,
      // Padrão geral para qrCode (qualquer URL)
      /<qrCode[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^<\]]+)(?:\]\]>)?<\/qrCode>/i,
      // Padrão sem CDATA
      /<qrCode>(https?:\/\/[^<]*)<\/qrCode>/i,
      // Padrão alternativo
      /QR-Code[^>]*>(https?:\/\/[^<]*)<\/QR-Code>/i
    ];
    
    let matchQr = null;
    for (let i = 0; i < regexPatterns.length; i++) {
      matchQr = autorizadoXML.match(regexPatterns[i]);
      if (matchQr) {
        console.log(`[SEFAZ] QR Code encontrado com padrão ${i + 1}:`, matchQr[1].substring(0, 100) + "...");
        break;
      }
    }
    
    const qrCodeUrl = matchQr ? matchQr[1].trim() : "";
    
    if (!qrCodeUrl) {
      console.log("[SEFAZ] AVISO: QR Code não encontrado no XML autorizado");
    }

    return { success: true, status: "autorizada", xmlAutorizado: autorizadoXML, chaveAcesso, qrCodeUrl };
  } catch (error: any) {
    await db.update(nfceLogsTable).set({
      status: "erro",
      mensagem_status_sefaz: error.message,
    }).where(eq(nfceLogsTable.id, log.id));

    return { success: false, status: "erro", mensagem: error.message };
  }
}