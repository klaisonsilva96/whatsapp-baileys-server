import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'silent' });

let sock: ReturnType<typeof makeWASocket> | null = null;
let qrCode: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

export async function initBaileys(): Promise<void> {
  try {
    connectionStatus = 'connecting';
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        qrCode = qr;
        connectionStatus = 'connecting';
        console.log('QR Code gerado - aguardando escaneamento...');
      }

      if (connection === 'open') {
        qrCode = null;
        connectionStatus = 'connected';
        console.log('WhatsApp conectado com sucesso!');
      }

      if (connection === 'close') {
        connectionStatus = 'disconnected';
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`Conexao fechada. Codigo: ${statusCode}. Reconectar: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => initBaileys(), 5000);
        } else {
          console.log('Deslogado do WhatsApp. Escaneie o QR novamente.');
          sock = null;
        }
      }
    });
  } catch (error) {
    console.error('Erro ao inicializar Baileys:', error);
    connectionStatus = 'disconnected';
    setTimeout(() => initBaileys(), 10000);
  }
}

export async function sendMessage(to: string, text: string): Promise<{ id: string }> {
  if (!sock) {
    throw new Error('WhatsApp nao conectado');
  }

  if (connectionStatus !== 'connected') {
    throw new Error(`WhatsApp em estado: ${connectionStatus}`);
  }

  const cleanNumber = to.replace(/\D/g, '');

  let formattedNumber = cleanNumber;
  if (!formattedNumber.startsWith('55')) {
    formattedNumber = '55' + formattedNumber;
  }

  const jid = formattedNumber + '@s.whatsapp.net';

  console.log(`Enviando mensagem para ${jid}...`);
  const result = await sock.sendMessage(jid, { text });

  return { id: result?.key?.id || 'unknown' };
}

export function getQR(): string | null {
  return qrCode;
}

export function getStatus(): { connected: boolean; status: string } {
  return {
    connected: connectionStatus === 'connected',
    status: connectionStatus,
  };
}
