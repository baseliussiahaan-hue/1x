/**
 * Buka foto "sekali lihat" (view once).
 *
 * Dua pemicu:
 *  1) Balas (reply) foto sekali lihat dengan  ,vv
 *  2) Beri reaksi (emoji) pada foto sekali lihat
 *
 * Jika config.forwardTo diisi, SEMUA keluaran (foto maupun pesan gagal)
 * hanya dikirim ke nomor itu; chat asal tidak ditulisi apa pun.
 *
 * Diadaptasi dari KnightBot-Mini (MIT), dipangkas hanya untuk foto.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- utilitas pesan ----------

// Buka pembungkus ephemeral / dokumen sampai ketemu isi pesan
function unwrap(message) {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

// Cari media view-once di sebuah pesan: { type: 'image'|'video'|'audio', media } atau null
function findViewOnce(message) {
  let m = message;
  let wrapped = false;
  for (let i = 0; i < 5 && m; i++) {
    const vo =
      m.viewOnceMessageV2Extension?.message || m.viewOnceMessageV2?.message || m.viewOnceMessage?.message;
    if (vo) {
      wrapped = true;
      m = vo;
      continue;
    }
    const inner = m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message;
    if (inner) {
      m = inner;
      continue;
    }
    break;
  }
  if (!m) return null;
  for (const [key, type] of [['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio']]) {
    if (m[key] && (wrapped || m[key].viewOnce)) return { type, media: m[key] };
  }
  return null;
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

// ---------- cache foto sekali lihat yang masuk (untuk pemicu reaksi) ----------
// Reaksi hanya membawa ID pesan, jadi isi foto harus diingat saat pesan masuk.
// Hanya info media foto view-once yang disimpan (bukan fotonya), maksimal 300 terakhir.
const MAX_CACHE = 300;
const cache = new Map();

function remember(msg) {
  const id = msg?.key?.id;
  if (!id || !msg.message || msg.key.fromMe) return;
  const found = findViewOnce(msg.message);
  if (found?.type !== 'image') return;
  cache.set(id, found.media);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

// ---------- unduh & kirim ----------

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
      console.error(
        `Unduh foto gagal (percobaan ${i}/${attempts}):`,
        err.message,
        err.cause?.code || err.cause?.message || ''
      );
      if (i < attempts) await sleep(1500 * i);
    }
  }
  throw lastErr;
}

function describeError(err) {
  const cause = err?.cause?.code || err?.cause?.message;
  return (err?.message || 'kesalahan tidak diketahui') + (cause ? ` (penyebab: ${cause})` : '');
}

// Cari JID nomor tujuan: string = valid, null = tidak diisi, undefined = diisi tapi tidak valid
async function resolveTarget(sock) {
  const digits = String(config.forwardTo || '').replace(/\D/g, '');
  if (!digits) return null;
  try {
    const [found] = (await sock.onWhatsApp(digits)) || [];
    if (found?.exists) return found.jid;
    console.error(`Nomor tujuan ${digits} tidak terdaftar di WhatsApp.`);
  } catch (err) {
    console.error('Gagal memeriksa nomor tujuan:', err.message);
  }
  return undefined;
}

// Siapkan jalur keluaran. quoted = pesan untuk di-quote saat membalas di chat asal (opsional)
async function createOutput(sock, chatId, quoted) {
  const target = await resolveTarget(sock);
  const opts = quoted ? { quoted } : undefined;
  return {
    target,
    async notify(text) {
      if (target) return sock.sendMessage(target, { text });
      if (target === null) return sock.sendMessage(chatId, { text }, opts);
      console.error('[viewonce]', text); // tujuan tidak valid: jangan bocor ke chat asal
    },
    async sendPhoto(buffer, caption) {
      if (target) return sock.sendMessage(target, { image: buffer, caption });
      if (target === null) return sock.sendMessage(chatId, { image: buffer, caption }, opts);
      console.error('[viewonce] foto berhasil dibuka tapi nomor tujuan tidak valid; tidak dikirim.');
    }
  };
}

// ---------- pemicu 1: perintah ,vv ----------

async function execute(sock, msg) {
  const chatId = msg.key.remoteJid;
  const out = await createOutput(sock, chatId, msg);

  try {
    const quoted = getContextInfo(msg.message)?.quotedMessage;
    if (!quoted) {
      return await out.notify('🗑️ Balas (reply) sebuah foto *sekali lihat* dengan perintah ini, atau beri reaksi pada fotonya.');
    }

    const found = findViewOnce(quoted);
    if (found && found.type !== 'image') {
      return await out.notify('❌ Bot ini hanya mendukung *foto*, bukan video atau audio.');
    }
    if (!found) return await out.notify('❌ Itu bukan foto sekali lihat!');

    const buffer = await downloadImage(found.media);
    await out.sendPhoto(buffer, found.media.caption || '');

    // Tanda kecil di pesan perintah (hanya jika hasil dikirim ke nomor lain)
    if (out.target) {
      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    }
  } catch (err) {
    console.error('Error pada perintah viewonce:', err);
    await out.notify('❌ Gagal membuka foto: ' + describeError(err)).catch(() => {});
  }
}

// ---------- pemicu 2: reaksi emoji ----------

async function handleReaction(sock, msg, reaction) {
  if (!reaction?.text) return; // reaksi dihapus
  if (config.reactionEmojis?.length && !config.reactionEmojis.includes(reaction.text)) return;

  const image = cache.get(reaction.key?.id);
  if (!image) return; // bukan foto sekali lihat yang dikenal bot: abaikan diam-diam

  const out = await createOutput(sock, msg.key.remoteJid, null);
  try {
    const buffer = await downloadImage(image);
    await out.sendPhoto(buffer, image.caption || '');
    // Tidak memberi reaksi balasan: akun yang sama hanya boleh punya satu reaksi per pesan,
    // jadi reaksi ✅ akan menimpa reaksi yang kamu berikan.
  } catch (err) {
    console.error('Error pada pemicu reaksi:', err);
    await out.notify('❌ Gagal membuka foto: ' + describeError(err)).catch(() => {});
  }
}

module.exports = { name: 'viewonce', execute, handleReaction, remember, unwrap };
