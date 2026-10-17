/**
 * Titik masuk bot - koneksi WhatsApp via Baileys
 */
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { handleMessage } = require('./handler');

const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // abaikan pesan lebih tua dari 5 menit
const processed = new Set();
setInterval(() => processed.clear(), 5 * 60 * 1000);

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(`./${config.sessionName}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    browser: ['Chrome', 'Windows', '10.0'],
    auth: state,
    syncFullHistory: false,
    markOnlineOnConnect: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Scan QR ini lewat WhatsApp > Perangkat Tertaut:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log(`\n✅ Bot terhubung sebagai ${sock.user.id.split(':')[0]}`);
      console.log(`⚡ Prefix: ${config.prefix}  |  Perintah: ${config.commands.join(', ')}\n`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`Koneksi terputus (${code ?? 'unknown'}). Sambung ulang: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        console.log('Sesi logout. Hapus folder sesi lalu jalankan ulang untuk login lagi.');
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key?.remoteJid;
      if (!msg.message || !msg.key?.id || !jid) continue;
      if (jid.includes('@broadcast') || jid.includes('@newsletter')) continue;
      if (processed.has(msg.key.id)) continue;

      if (msg.messageTimestamp && Date.now() - msg.messageTimestamp * 1000 > MESSAGE_AGE_LIMIT) {
        continue;
      }
      processed.add(msg.key.id);

      handleMessage(sock, msg).catch((err) => {
        console.error('Error saat menangani pesan:', err.message);
      });
    }
  });
}

console.log('🚀 Memulai bot...');
startBot().catch((err) => {
  console.error('Gagal memulai bot:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
