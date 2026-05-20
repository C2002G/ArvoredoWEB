import http from 'http';

const PORT = 4000;

const server = http.createServer((req, res) => {
  // Ignora o CORS para testes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/api/v1/pagamentos') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      const payload = JSON.parse(body);
      console.log('💳 [SIMULADOR STONE] Recebido pedido de pagamento:');
      console.log(`   Valor: R$ ${payload.valor}`);
      console.log(`   Tipo: ${payload.tipo}`);
      
      // Simula o tempo que a pessoa demora para digitar a senha (3 segundos)
      console.log('   Aguardando digitação da senha...');
      
      setTimeout(() => {
        const respostaAprovada = {
          status: "aprovado",
          cnpj_credenciadora: "16.088.083/0001-55",
          codigo_autorizacao: Math.floor(100000 + Math.random() * 900000).toString(),
          bandeira_cartao: payload.tipo === 'credito' ? "MASTERCARD" : "VISA",
          tipo_pagamento: payload.tipo === 'credito' ? "03" : "04"
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(respostaAprovada));
        console.log('✅ [SIMULADOR STONE] Pagamento Aprovado retornado ao PDV!\n');
      }, 3000);
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`📠 Simulador da Maquininha Stone rodando em http://127.0.0.1:${PORT}`);
  console.log('Vá no PDV Arvoredo, adicione um produto e clique em Débito ou Crédito!');
});