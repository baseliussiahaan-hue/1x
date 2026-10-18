/**
 * Buka foto "sekali lihat" (view once).
 *
 * Dua pemicu:
 *  1) Balas (reply) foto sekali lihat dengan command
 *  2) Beri reaksi emoji pada foto sekali lihat
 *
 * Jika config.forwardTo diisi, keluaran dikirim ke nomor itu.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function getContextInfo(message) {
  const m = unwrap(message);
  if (!m) return null;
  for (const value of Object.values(m)) {
    if (value && typeof value === 'object' && value.contextInfo) return value.contextInfo;
  }
  return null;
}

// Reaksi hanya membawa ID pesan asli. Simpan metadata foto masuk, bukan isi fotonya.
const MAX_CACHE = 300;
const cache = new Map();

function cacheKey(chatId, messageId) {
  return chatId && messageId ? chatId + ':' + messageId : '';
}

function remember(msg) {
  const id = msg?.key?.id;
  const chatId = msg?.key?.remoteJid;
  if (!id || !chatId || !msg.message || msg.key.fromMe) return;
  const found = findViewOnce(msg.message);
  if (found?.type !== 'image') return;
  cache.set(cacheKey(chatId, id), found.media);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

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

async function createOutput(sock, chatId, quoted) {
  const target = await resolveTarget(sock);
  const opts = quoted ? { quoted } : undefined;
  return {
    target,
    async notify(text) {
      if (target) return sock.sendMessage(target, { text });
      if (target === null) return sock.sendMessage(chatId, { text }, opts);
      console.error('[viewonce]', text);
    },
    async sendPhoto(buffer, caption) {
      if (target) return sock.sendMessage(target, { image: buffer, caption });
      if (target === null) return sock.sendMessage(chatId, { image: buffer, caption }, opts);
      console.error('[viewonce] foto berhasil dibuka tapi nomor tujuan tidak valid; tidak dikirim.');
    }
  };
}

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
  } catch (err) {
    console.error('Error pada perintah viewonce:', err);
    await out.notify('❌ Gagal membuka foto: ' + describeError(err)).catch(() => {});
  }
}

async function handleReaction(sock, msg, reaction) {
  if (!reaction?.text) return;
  if (config.reactionEmojis?.length && !config.reactionEmojis.includes(reaction.text)) return;

  const originalMessageId = reaction.key?.id;
  const chatId = msg.key?.remoteJid;
  const image = cache.get(cacheKey(chatId, originalMessageId));
  if (!image) return;

  const out = await createOutput(sock, chatId, null);
  try {
    const buffer = await downloadImage(image);
    await out.sendPhoto(buffer, image.caption || '');
  } catch (err) {
    console.error('Error pada pemicu reaksi:', err);
    await out.notify('❌ Gagal membuka foto: ' + describeError(err)).catch(() => {});
  }
}

module.exports = { name: 'viewonce', execute, handleReaction, remember, unwrap, getContextInfo };
