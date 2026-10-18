/**
 * Handler pesan masuk: cek command, izin, lalu jalankan perintah viewonce.
 */
const config = require('./config');
const viewonce = require('./commands/viewonce');

function unwrapMessage(message) {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const inner = m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m || {};
}

function getText(message) {
  const m = unwrapMessage(message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

function normalizeCommand(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function senderNumber(msg) {
  const jid = msg.key.participant || msg.key.remoteJid || '';
  return jid.split('@')[0].split(':')[0];
}

function isAllowed(msg) {
  if (!config.onlyOwner) return true;
  if (msg.key.fromMe) return true;
  return (config.ownerNumber || []).includes(senderNumber(msg));
}

async function handleMessage(sock, msg) {
  // Muat konfigurasi terbaru dari disk setiap kali ada pesan.
  try {
    const configPath = require.resolve('./config');
    delete require.cache[configPath];
    const freshConfig = require('./config');
    Object.assign(config, freshConfig);
    // Prefix akun khusus hanya dipakai jika memang disetel untuk proses ini.
    if (process.env.PREFIX !== undefined) config.prefix = process.env.PREFIX;
  } catch (err) {
    console.error('Gagal memuat konfigurasi terbaru:', err.message);
  }

  viewonce.remember(msg);

  const reaction = viewonce.unwrap(msg.message)?.reactionMessage;
  if (reaction) {
    if (config.reactionTrigger && isAllowed(msg)) await viewonce.handleReaction(sock, msg, reaction);
    return;
  }

  const rawText = normalizeCommand(getText(msg.message));
  if (!rawText) return;

  const prefix = String(config.prefix ?? ',');
  const candidates = [rawText];

  // Coba command dengan prefix aktif, dan juga tanpa prefix.
  if (prefix && rawText.startsWith(prefix)) {
    candidates.unshift(normalizeCommand(rawText.slice(prefix.length)));
  }

  // Jika prefix pernah diganti, izinkan prefix simbol lama/umum hanya bila
  // teks setelah simbol cocok PERSIS dengan command yang terdaftar.
  const strippedPunctuation = normalizeCommand(rawText.replace(/^[^\p{L}\p{N}_-]+/u, ''));
  if (strippedPunctuation !== rawText) candidates.push(strippedPunctuation);

  const registered = (config.commands || []).map(normalizeCommand).filter(Boolean);
  const matched = candidates.some((candidate) => registered.includes(candidate));
  if (!matched) return;

  if (!isAllowed(msg)) return;
  await viewonce.execute(sock, msg);
}

module.exports = { handleMessage };
