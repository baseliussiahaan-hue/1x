/**
 * Titik masuk bot - koneksi WhatsApp via Baileys
 */
// Hindari 'fetch failed' akibat IPv6 yang tidak tersedia/lambat pada jaringan tertentu
try { require('dns').setDefaultResultOrder('ipv4first'); } catch (e) { /* Node lama */ }

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const readline = require('readline');
const fs = require('fs');
const config = require('./config');

// Dukungan multi-akun: multi-start.js menjalankan satu proses per akun dan
// mengisi env di bawah ini. Tanpa env ini, perilaku sama seperti satu akun biasa.
const ACCOUNT_ID = process.env.ACCOUNT_ID || '';
const logPrefix = ACCOUNT_ID ? `[${ACCOUNT_ID}] ` : '';
const sessionDir = process.env.SESSION_DIR || `./${config.sessionName}`;
if (process.env.FORWARD_TO !== undefined) config.forwardTo = process.env.FORWARD_TO;
if (process.env.OWNER_NUMBERS !== undefined) {
  config.ownerNumber = process.env.OWNER_NUMBERS.split(',').map((s) => s.trim()).filter(Boolean);
}
if (process.env.ONLY_OWNER !== undefined) config.onlyOwner = process.env.ONLY_OWNER !== 'false';
if (process.env.PREFIX !== undefined) config.prefix = process.env.PREFIX;

const { handleMessage } = require('./handler');

const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // abaikan pesan lebih tua dari 5 menit
let authResets = 0; // berapa kali sesi dihapus otomatis karena 401
const processed = new Set();
let terminalMenuStarted = false;
setInterval(() => processed.clear(), 5 * 60 * 1000);

// Menu terminal setelah bot berhasil terhubung.
function startTerminalMenu() {
  if (terminalMenuStarted || !process.stdin.isTTY) return;
  terminalMenuStarted = true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askMenu = () => {
    console.log('\n=== MENU BOT ===');
    console.log('1. Keluar');
    console.log('2. Ganti perintah/command');
    console.log('3. Tambah akun WhatsApp lain');
    console.log('4. Tambah command baru');
    rl.question('Pilih (1/4): ', (choice) => {
      if (choice.trim() === '1') {
        console.log('Menutup bot...');
        rl.close();
        process.exit(0);
        return;
      }

      if (choice.trim() === '2') {
        console.log(`Command saat ini: ${config.commands.join(', ')}`);
        rl.question('Masukkan command baru, pisahkan dengan koma (contoh: vv, viewonce): ', (answer) => {
          const commands = [...new Set(answer.split(',').map((item) => item.trim().replace(/^,+/, '').replace(/^[.!#]+/, '').replace(/\s+/g, ' ')).filter((item) => /^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/.test(item)))];
          if (commands.length === 0) {
            console.log('Tidak ada command valid. Command tidak diubah.');
            askMenu();
            return;
          }

          try {
            const configPath = require.resolve('./config');
            const source = fs.readFileSync(configPath, 'utf8');
            const updated = source.replace(/commands:\s*\[[^\]]*\]/, 'commands: ' + JSON.stringify(commands));
            if (updated === source) throw new Error('Baris commands tidak ditemukan di config.js');
            fs.writeFileSync(configPath, updated, 'utf8');
            config.commands = commands;
            console.log('Command berhasil disimpan ke config.js: ' + commands.join(', '));
          } catch (err) {
            console.error('Gagal menyimpan command:', err.message);
          }
          askMenu();
        });
        return;
      }

      if (choice.trim() === '4') {
        rl.question('Masukkan command baru (boleh beberapa kata, contoh: apa coba): ', (answer) => {
          const command = answer.trim().replace(/\s+/g, ' ').toLowerCase();
          if (!/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/.test(command)) {
            console.log('Command tidak valid. Gunakan huruf/angka, spasi, - atau _.');
            askMenu();
            return;
          }
          const commands = [...new Set([...(config.commands || []), command])];
          try {
            const configPath = require.resolve('./config');
            const source = fs.readFileSync(configPath, 'utf8');
            const updated = source.replace(/commands:\s*\[[^\]]*\]/, 'commands: ' + JSON.stringify(commands));
            if (updated === source) throw new Error('Baris commands tidak ditemukan di config.js');
            fs.writeFileSync(configPath, updated, 'utf8');
            config.commands = commands;
            console.log('Command berhasil ditambahkan: ' + command);
            console.log('Balas foto sekali lihat dengan teks tersebut, tanpa prefix.');
          } catch (err) {
            console.error('Gagal menyimpan command:', err.message);
          }
          askMenu();
        });
        return;
      }

      if (choice.trim() === '3') {
        const { loadAccounts, saveAccounts, ID_RE } = require('./lib/accounts-store');
        const accounts = loadAccounts({ required: false });
        rl.question('ID akun baru (mis. akun2, tanpa spasi): ', (rawId) => {
          const id = rawId.trim();
          if (!ID_RE.test(id)) {
            console.log('ID tidak valid. Gunakan huruf, angka, tanda - atau _.');
            askMenu();
            return;
          }
          if (accounts.some((account) => account.id === id)) {
            console.log('ID akun tersebut sudah ada. Pilih ID lain.');
            askMenu();
            return;
          }
          rl.question('Nomor WhatsApp akun baru dengan kode negara (kosongkan untuk login QR): ', (rawNumber) => {
            const pairingNumber = normalizeNumber(rawNumber);
            accounts.push({ id, pairingNumber });
            try {
              saveAccounts(accounts);
              console.log('Akun "' + id + '" berhasil disimpan ke data/accounts.json.');
              console.log('Untuk menjalankan semua akun, hentikan bot lalu jalankan: npm run accounts');
            } catch (err) {
              console.error('Gagal menyimpan akun:', err.message);
            }
            askMenu();
          });
        });
        return;
      }

      console.log('Pilihan tidak valid. Masukkan 1, 2, 3, atau 4.');
      askMenu();
    });
  };

  askMenu();
}

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
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
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
  let logoutRequested = false;
  const logoutAndExit = async () => {
    if (logoutRequested) return;
    logoutRequested = true;
    console.log(logPrefix + 'Permintaan logout diterima; memutuskan sesi WhatsApp...');
    try { await sock.logout(); }
    catch (err) { console.error(logPrefix + 'Logout WhatsApp gagal: ' + err.message); }
    finally {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); }
      catch (err) { console.error(logPrefix + 'Gagal menghapus folder sesi: ' + err.message); }
      process.exit(0);
    }
  };
  process.on('message', (message) => { if (message && message.type === 'logout') logoutAndExit(); });
  process.on('SIGTERM', logoutAndExit);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && pairingNumber) {
      // Mode kode pairing: minta kode sekali saja saat koneksi siap
      if (!pairingRequested) {
        pairingRequested = true;
        sock
          .requestPairingCode(pairingNumber)
          .then((code) => {
            const pretty = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(`\n${logPrefix}📞 Nomor yang dipakai: ${pairingNumber}`);
            console.log(`${logPrefix}🔑 Kode pairing kamu: ${pretty}`);
            console.log(`${logPrefix}   (Hanya kode TERBARU yang berlaku. Jika bot restart, pakai kode baru.)`);
            console.log(`${logPrefix}   Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat >`);
            console.log(`${logPrefix}   "Tautkan dengan nomor telepon saja", lalu masukkan kode di atas.\n`);
          })
          .catch((err) => console.error(`${logPrefix}Gagal meminta kode pairing:`, err.message));
      }
    } else if (qr) {
      console.log(`\n${logPrefix}📱 Scan QR ini lewat WhatsApp > Perangkat Tertaut:\n`);
      qrcode.generate(qr, { small: true });
      const qrFile = ACCOUNT_ID ? `qr_${ACCOUNT_ID}.png` : 'qr.png';
      QRCode.toFile(qrFile, qr, { scale: 10, margin: 4 })
        .then(() => console.log(`${logPrefix}🖼️  QR juga disimpan sebagai gambar: ${qrFile} (buka lalu scan dari HP lain)`))
        .catch(() => {});
    }

    if (connection === 'open') {
      authResets = 0;
      console.log(`\n${logPrefix}✅ Bot terhubung sebagai ${sock.user.id.split(':')[0]}`);
      console.log(`${logPrefix}⚡ Prefix: ${config.prefix}  |  Perintah: ${config.commands.join(', ')}\n`);
      startTerminalMenu();
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`${logPrefix}Koneksi terputus (${code ?? 'unknown'}). Sambung ulang: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        // 401 = sesi ditolak / logout. Hapus sesi rusak dan coba login ulang, maksimal 1 kali.
        if (authResets >= 1) {
          console.log(`${logPrefix}❌ Login ditolak lagi (401). Berhenti supaya tidak membuat kode baru terus-menerus.`);
          console.log(`${logPrefix}   Cek: nomor sesuai akun WhatsApp di HP, pakai kode TERBARU, lalu jalankan ulang.`);
          process.exit(1);
        }
        authResets++;
        console.log(`${logPrefix}⚠️ Sesi tidak valid (401). Menghapus sesi lama dan mengulang login sekali...`);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (err) {
          console.error('Gagal menghapus folder sesi, hapus manual:', err.message);
        }
        setTimeout(startBot, 2000);
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // 'append' dipakai untuk pesan/reaksi dari HP sendiri; pesan lama tetap disaring lewat batas umur
    if (type !== 'notify' && type !== 'append') return;

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
