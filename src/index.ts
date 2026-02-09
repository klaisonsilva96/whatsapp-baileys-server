import express from 'express';
import QRCode from 'qrcode';
import { initBaileys, sendMessage, getQR, getStatus } from './baileys';

const app = express();
app.use(express.json());

const API_KEY = process.env.BAILEYS_API_KEY || 'chave-padrao-trocar';
const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || '';

// Middleware de autenticacao
app.use((req, res, next) => {
  if (req.path === '/health') return next();

  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Nao autorizado' });
  }
  next();
});

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check (publico)
app.get('/health', (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Status da conexao
app.get('/status', (_, res) => {
  res.json(getStatus());
});

// QR Code
app.get('/qr', async (_, res) => {
  const qr = getQR();
  if (qr) {
    try {
      const qrImage = await QRCode.toDataURL(qr);
      res.json({ qr: qrImage, connected: false });
    } catch {
      res.json({ qr: qr, connected: false });
    }
  } else {
    const status = getStatus();
    res.json({ connected: status.connected, message: status.connected ? 'Ja autenticado' : 'Aguardando...' });
  }
});

// Enviar mensagem
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: '"to" e "message" sao obrigatorios' });
  }

  try {
    const result = await sendMessage(to, message);
    res.json({ success: true, messageId: result.id });
  } catch (error: any) {
    console.error('Erro ao enviar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  await initBaileys();

  // Self-ping para evitar sleep do Render (a cada 14 min)
  if (RENDER_URL) {
    setInterval(() => {
      fetch(`${RENDER_URL}/health`).catch(() => {});
    }, 14 * 60 * 1000);
    console.log(`Keep-alive configurado para ${RENDER_URL}`);
  }
});
