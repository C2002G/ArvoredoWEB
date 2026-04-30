// in: artifacts/api-server/src/services/sefaz.service.ts
import { db } from "@workspace/db";
import { configFiscalTable, nfceLogsTable, Venda, ItemVenda, Produto, Cliente } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createRequire } from "node:module";

// Solução definitiva para carregar a biblioteca node-dfe sem erros de ESM
const require = createRequire(import.meta.url);
const nodeDfe = require("node-dfe");
const { Dfe, NFe, Nfce, Certificado } = nodeDfe;

// Carrega a configuração fiscal do banco de dados
async function getFiscalConfig() {
  const [config] = await db.select().from(configFiscalTable).limit(1);
  if (!config) {
    throw new Error("Configuração fiscal não encontrada no banco de dados.");
  }
  return config;
}

// Mapeia o pagamento do seu sistema para os códigos da SEFAZ
function getPagamentoSefaz(venda: Venda) {
  const observacao = venda.observacao?.toLowerCase() || "";

  switch (venda.pagamento) {
    case "dinheiro": return { tPag: "01", vPag: venda.total }; // Dinheiro
    case "pix": return { tPag: "17", vPag: venda.total }; // PIX
    case "cartao":
      if (observacao.includes("debito")) {
        return { tPag: "04", vPag: venda.total, card: { tpIntegra: "2", tBand: "99" } }; // Débito
      }
      return { tPag: "03", vPag: venda.total, card: { tpIntegra: "2", tBand: "99" } }; // Crédito
    case "fiado": return { tPag: "99", vPag: venda.total }; // Outros (crediário)
    default: return { tPag: "99", vPag: venda.total }; // Outros
  }
}

// Função principal de emissão
export async function emitirNfce(venda: Venda, itens: ItemVenda[], produtos: Produto[], cliente?: Cliente | null) {
  const config = await getFiscalConfig();

  const [log] = await db.insert(nfceLogsTable).values({
    venda_id: venda.id,
    ambiente: config.ambiente,
    status: 'processando',
  }).returning();

  try {
    // Agora o Certificado existirá e não dará erro de "undefined"
    const certificado = Certificado.fromPfx(
      config.caminho_certificado,
      config.senha_certificado
    );

    const dfe = new Dfe(certificado, {
      uf: "RS",
      ambiente: config.ambiente === "homologacao" ? "2" : "1",
      modelo: "65", // NFC-e
    });

    const nfce = new Nfce();
    nfce.setEmitente({
      razaoSocial: config.razao_social,
      nomeFantasia: config.nome_fantasia,
      cnpj: config.cnpj,
      ie: config.ie,
      crt: config.crt,
      endereco: {
        logradouro: config.endereco,
        numero: config.numero,
        bairro: config.bairro,
        municipio: config.cidade,
        uf: config.uf,
        cep: config.cep,
        codigoMunicipio: config.cod_municipio,
      },
    });

    if (cliente?.cpf) {
        nfce.setDestinatario({
            cpf: cliente.cpf,
            nome: cliente.nome,
            indicadorContribuinte: "9" // 9 = Não contribuinte
        })
    }
    
    itens.forEach((item, index) => {
        const produto = produtos.find(p => p.id === item.produto_id);
        if (!produto) return;
        nfce.adicionarItem({
            numero: index + 1,
            codigo: String(item.produto_id),
            descricao: item.nome_snap,
            quantidade: item.quantidade,
            unidade: produto.unidade || "UN",
            valor: item.preco_unit,
            cfop: produto.cfop || "5102",
            ncm: produto.ncm || "00000000",
        });
    });

    nfce.adicionarPagamento(getPagamentoSefaz(venda));

    nfce.setInformacoes({
      versao: "4.00",
      operacao: "1", // 1=Saída
      finalidade: "1", // 1=Normal
      consumidorFinal: "1",
      presenca: "1", // 1=Presencial
    });

    const xmlEnviado = await dfe.gerarNfce(nfce, {
        idCSC: config.csc_id,
        CSC: config.csc_token,
    });
    
    await db.update(nfceLogsTable).set({ xml_enviado: xmlEnviado.xml }).where(eq(nfceLogsTable.id, log.id));

    const retorno: any = await dfe.enviarNfce(xmlEnviado);

    if (retorno.isAutorizada()) {
        const xmlAutorizado = NFe.gerarXmlProcesso(xmlEnviado, retorno.retorno);
        await db.update(nfceLogsTable).set({
            status: 'autorizada',
            chave_acesso: retorno.getChave(),
            protocolo: retorno.getProtocolo(),
            codigo_status_sefaz: retorno.getProtocoloStatus(),
            mensagem_status_sefaz: retorno.getProtocoloMotivo(),
            xml_autorizado: xmlAutorizado,
            json_retorno_sefaz: retorno.retorno,
        }).where(eq(nfceLogsTable.id, log.id));
        
        return { success: true, retorno, xmlAutorizado, qrCodeUrl: xmlEnviado.getQrCode(), chaveAcesso: retorno.getChave() };
    } else {
        await db.update(nfceLogsTable).set({
            status: 'rejeitada',
            chave_acesso: retorno.getChave(),
            codigo_status_sefaz: retorno.getRejeicaoStatus(),
            mensagem_status_sefaz: retorno.getRejeicaoMotivo(),
            json_retorno_sefaz: retorno.retorno,
        }).where(eq(nfceLogsTable.id, log.id));

        throw new Error(`[${retorno.getRejeicaoStatus()}] ${retorno.getRejeicaoMotivo()}`);
    }

  } catch (error: any) {
    await db.update(nfceLogsTable).set({
      status: 'erro',
      mensagem_status_sefaz: error.message || "Erro desconhecido ao emitir NFC-e",
    }).where(eq(nfceLogsTable.id, log.id));
    
    console.error("Erro ao emitir NFC-e:", error);
    throw error;
  }
}