/**
 * Titik masuk bot - koneksi WhatsApp via Baileys
 */
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const fs = require('fs');
const config = require('./config');
const { handleMessage } = require('./handler');

const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // abaikan pesan lebih tua dari 5 menit
const processed = new Set();
setInterval(() => processed.clear(), 5 * 60 * 1000);

// Tanya nomor WhatsApp untuk login via kode pairing (tanpa scan QR).
// Urutan: env PAIRING_NUMBER > config.pairingNumber > prompt terminal. Kosong = pakai QR.
function normalizeNumber(input) {
  let n = String(input || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1); // 0812... -> 62812...
  return n;
}

async function getPairingNumber() {
  const fromEnv = normalizeNumber(process.env.PAIRING_NUMBER || config.pairingNumber);
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) return '';

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(
      '\n📞 Masukkan nomor WhatsApp dengan kode negara (contoh 6281234567890)\n' +
        '   atau tekan Enter untuk login pakai QR: ',
      resolve
    )
  );
  rl.close();
  return normalizeNumber(answer);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(`./${config.sessionName}`);
  const { version } = await fetchLatestBaileysVersion();

  const needsLogin = !state.creds.registered;
  const pairingNumber = needsLogin ? await getPairingNumber() : '';
  let pairingRequested = false;

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    // Pairing code butuh identitas browser yang dikenali WhatsApp
    browser: Browsers.ubuntu('Chrome'),
    auth: state,
    syncFullHistory: false,
    markOnlineOnConnect: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && pairingNumber) {
      // Mode kode pairing: minta kode sekali saja saat koneksi siap
      if (!pairingRequested) {
        pairingRequested = true;
        sock
          .requestPairingCode(pairingNumber)
          .then((code) => {
            const pretty = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(`\n📞 Nomor yang dipakai: ${pairingNumber}`);
            console.log(`🔑 Kode pairing kamu: ${pretty}`);
            console.log('   (Hanya kode TERBARU yang berlaku. Jika bot restart, pakai kode baru.)');
            console.log('   Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat >');
            console.log('   "Tautkan dengan nomor telepon saja", lalu masukkan kode di atas.\n');
          })
          .catch((err) => console.error('Gagal meminta kode pairing:', err.message));
      }
    } else if (qr) {
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
        // 401 = sesi ditolak / logout dari HP. Hapus sesi rusak lalu mulai login dari awal.
        console.log('⚠️ Sesi tidak valid (logout). Menghapus sesi lama dan memulai login ulang...');
        try {
          fs.rmSync(`./${config.sessionName}`, { recursive: true, force: true });
        } catch (err) {
          console.error('Gagal menghapus folder sesi, hapus manual:', err.message);
        }
        setTimeout(startBot, 2000);
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
