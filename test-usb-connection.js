// Teste de conexão USB com impressora
import escpos from 'escpos';
import escposUsb from 'escpos-usb';

escpos.USB = escposUsb.default || escposUsb;

async function testUSBConnection() {
  console.log("=== TESTE DE CONEXÃO USB ===");
  
  try {
    // Testar com caminho específico
    console.log("1. Testando com USB001...");
    const device1 = new escpos.USB('USB001');
    await new Promise((resolve, reject) => {
      device1.open((err) => {
        if (err) {
          console.error("❌ USB001 falhou:", err.message);
          testAutoDetect();
        } else {
          console.log("✅ USB001 conectado com sucesso!");
          device1.close();
        }
        resolve();
      });
    });
  } catch (err) {
    console.error("❌ Erro ao criar dispositivo USB001:", err.message);
    testAutoDetect();
  }
}

function testAutoDetect() {
  try {
    console.log("2. Testando auto-detect...");
    const device2 = new escpos.USB();
    device2.open((err) => {
      if (err) {
        console.error("❌ Auto-detect falhou:", err.message);
      } else {
        console.log("✅ Auto-detect funcionou!");
        device2.close();
      }
    });
  } catch (err) {
    console.error("❌ Erro no auto-detect:", err.message);
  }
}

testUSBConnection();
