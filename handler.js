/**
 * Handler pesan masuk: cek prefix, izin, lalu jalankan perintah viewonce.
 */
const config = require('./config');
const viewonce = require('./commands/viewonce');

function getText(message) {
  const m =
    message?.ephemeralMessage?.message ||
    message?.documentWithCaptionMessage?.message ||
    message;
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    ''
  );
}

function senderNumber(msg) {
  const jid = msg.key.participant || msg.key.remoteJid || '';
  return jid.split('@')[0].split(':')[0];
}

function isAllowed(msg) {
  if (!config.onlyOwner) return true;
  if (msg.key.fromMe) return true;
  return config.ownerNumber.includes(senderNumber(msg));
}

async function handleMessage(sock, msg) {
  // Ingat foto sekali lihat yang masuk (dipakai pemicu reaksi)
  viewonce.remember(msg);

  // Pemicu reaksi: beri emoji pada foto sekali lihat
  const reaction = viewonce.unwrap(msg.message)?.reactionMessage;
  if (reaction) {
    if (config.reactionTrigger && isAllowed(msg)) await viewonce.handleReaction(sock, msg, reaction);
    return;
  }

  const text = getText(msg.message).trim();
  if (!text.startsWith(config.prefix)) return;

  const command = text.slice(config.prefix.length).trim().split(/\s+/)[0].toLowerCase();
  if (!config.commands.includes(command)) return;

  if (!isAllowed(msg)) return;

  await viewonce.execute(sock, msg);
}

module.exports = { handleMessage };
