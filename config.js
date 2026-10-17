/**
 * Konfigurasi bot
 */
module.exports = {
  // Prefix perintah, contoh: ,vv  atau  .vv
  prefix: ',',

  // Login tanpa QR: isi nomor WhatsApp-mu dengan kode negara (contoh '6281234567890').
  // Kosong = bot akan menanyakan saat start, atau pakai QR kalau tidak diisi.
  pairingNumber: '',

  // Nama folder penyimpanan sesi login WhatsApp
  sessionName: 'session',

  // Hanya akun yang menjalankan bot (fromMe) dan nomor di bawah ini yang boleh memakai perintah.
  // Isi tanpa tanda + dan spasi, contoh: '6281234567890'
  ownerNumber: [],
  onlyOwner: true,

  // Nomor tujuan hasil foto (kode negara, tanpa + atau spasi).
  // Kalau diisi, foto dikirim ke nomor ini dan chat asal hanya diberi reaksi ✅.
  // Kosongkan ('') untuk membalas di chat asal seperti biasa.
  forwardTo: '6287861232351',

  // Pemicu lewat reaksi: beri emoji pada foto sekali lihat, bot membukanya.
  // Hanya foto yang masuk SETELAH bot menyala yang bisa dibuka.
  reactionTrigger: true,
  // Batasi emoji pemicu, contoh ['🐵']. Kosong = emoji apa pun.
  reactionEmojis: [],

  // Nama perintah yang memicu fitur
  commands: ['vv', 'viewonce', 'readvo', 'readviewonce']
};
