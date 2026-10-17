/**
 * Perintah viewonce - buka foto "sekali lihat" (view once).
 * Cara pakai: balas (reply) foto sekali lihat dengan  ,vv
 *
 * Diadaptasi dari KnightBot-Mini (MIT), dipangkas hanya untuk foto.
 * Jika config.forwardTo diisi, SEMUA keluaran (foto maupun pesan gagal)
 * hanya dikirim ke nomor itu; chat asal hanya diberi reaksi ✅ saat sukses.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Buka pembungkus pesan (ephemeral / view once) sampai ketemu isi aslinya
function unwrap(message) {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessage?.message ||
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

// Ambil contextInfo (info pesan yang dibalas) dari tipe pesan apa pun
function getContextInfo(message) {
  const m = unwrap(message);
  if (!m) return null;
  for (const value of Object.values(m)) {
    if (value && typeof value === 'object' && value.contextInfo) return value.contextInfo;
  }
  return null;
}

// Unduh foto dengan retry (error jaringan sesaat sering terjadi)
async function downloadImage(image, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const stream = await downloadContentFromMessage(image, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      lastErr = err;
      console.error(`Unduh foto gagal (percobaan ${i}/${attempts}):`, err.message, err.cause?.code || err.cause?.message || '');
      if (i < attempts) await sleep(1500 * i);
    }
  }
  throw lastErr;
}

function describeError(err) {
  const cause = err?.cause?.code || err?.cause?.message;
  return (err?.message || 'kesalahan tidak diketahui') + (cause ? ` (penyebab: ${cause})` : '');
}

// Cari JID nomor tujuan (null jika tidak diisi / tidak terdaftar)
async function resolveTarget(sock) {
  const digits = String(config.forwardTo || '').replace(/\D/g, '');
  if (!digits) return null;
  const [found] = (await sock.onWhatsApp(digits)) || [];
  if (!found?.exists) {
    console.error(`Nomor tujuan ${digits} tidak terdaftar di WhatsApp.`);
    return undefined; // tujuan diisi tapi tidak valid
  }
  return found.jid;
}

module.exports = {
  name: 'viewonce',

  async execute(sock, msg) {
    const chatId = msg.key.remoteJid;
    let target;
    try {
      target = await resolveTarget(sock);
    } catch (err) {
      console.error('Gagal memeriksa nomor tujuan:', err.message);
      target = undefined;
    }

    // Semua pesan (info/gagal) hanya ke nomor tujuan; tanpa forwardTo, balas di chat asal
    const notify = async (text) => {
      if (target) return sock.sendMessage(target, { text });
      if (target === null) return sock.sendMessage(chatId, { text }, { quoted: msg });
      console.error('[viewonce]', text); // tujuan tidak valid: jangan bocor ke chat asal
    };

    try {
      const ctx = getContextInfo(msg.message);
      const quoted = ctx?.quotedMessage;

      if (!quoted) {
        return await notify('🗑️ Balas (reply) sebuah foto *sekali lihat* dengan perintah ini.');
      }

      const inner = unwrap(quoted);
      const isWrapped = !!(
        quoted.viewOnceMessageV2 ||
        quoted.viewOnceMessageV2Extension ||
        quoted.viewOnceMessage
      );

      if (inner?.videoMessage || inner?.audioMessage) {
        return await notify('❌ Bot ini hanya mendukung *foto*, bukan video atau audio.');
      }

      const image = inner?.imageMessage;
      if (!image || !(isWrapped || image.viewOnce)) {
        return await notify('❌ Itu bukan foto sekali lihat!');
      }

      const buffer = await downloadImage(image);
      const caption = image.caption || '';

      if (target) {
        await sock.sendMessage(target, { image: buffer, caption });
        // Tanda kecil di pesan perintah, tanpa menampilkan fotonya di chat asal
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
      } else if (target === null) {
        await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: msg });
      } else {
        console.error('[viewonce] foto berhasil dibuka tapi nomor tujuan tidak valid; tidak dikirim.');
      }
    } catch (err) {
      console.error('Error pada perintah viewonce:', err);
      await notify('❌ Gagal membuka foto: ' + describeError(err)).catch(() => {});
    }
  }
};
