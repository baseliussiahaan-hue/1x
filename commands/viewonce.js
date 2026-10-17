/**
 * Perintah viewonce - buka foto "sekali lihat" (view once).
 * Cara pakai: balas (reply) foto sekali lihat dengan  ,vv
 *
 * Diadaptasi dari KnightBot-Mini (MIT), dipangkas hanya untuk foto.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

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

module.exports = {
  name: 'viewonce',

  async execute(sock, msg) {
    const chatId = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

    try {
      const ctx = getContextInfo(msg.message);
      const quoted = ctx?.quotedMessage;

      if (!quoted) {
        return await reply('🗑️ Balas (reply) sebuah foto *sekali lihat* dengan perintah ini.');
      }

      const inner = unwrap(quoted);
      const isWrapped = !!(
        quoted.viewOnceMessageV2 ||
        quoted.viewOnceMessageV2Extension ||
        quoted.viewOnceMessage
      );

      if (inner?.videoMessage || inner?.audioMessage) {
        return await reply('❌ Bot ini hanya mendukung *foto*, bukan video atau audio.');
      }

      const image = inner?.imageMessage;
      if (!image || !(isWrapped || image.viewOnce)) {
        return await reply('❌ Itu bukan foto sekali lihat!');
      }

      const stream = await downloadContentFromMessage(image, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      const caption = image.caption || '';

      if (config.forwardTo) {
        // Kirim hasil ke nomor tujuan, bukan ke chat asal
        const digits = String(config.forwardTo).replace(/\D/g, '');
        const [found] = (await sock.onWhatsApp(digits)) || [];
        if (!found?.exists) {
          return await reply('❌ Nomor tujuan ' + digits + ' tidak terdaftar di WhatsApp.');
        }
        await sock.sendMessage(found.jid, { image: buffer, caption });
        // Tanda kecil di pesan perintah, tanpa menampilkan fotonya di chat asal
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
      } else {
        await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: msg });
      }
    } catch (err) {
      console.error('Error pada perintah viewonce:', err);
      await reply('❌ Gagal membuka foto: ' + (err.message || 'kesalahan tidak diketahui'));
    }
  }
};
