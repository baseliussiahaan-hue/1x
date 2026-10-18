/**
 * Menu interaktif untuk kelola akun WhatsApp bot — tidak perlu edit
 * data/accounts.json manual.
 *
 *   node manage.js   (atau: npm run accounts)
 *
 * Pilih nomor menunya:
 *   1. Tambah akun   - isi id + nomor WhatsApp, langsung bisa dijalankan
 *   2. Hapus akun    - pilih dari daftar, folder sesinya juga bisa dihapus
 *   3. Jalankan semua akun
 *   4. Keluar
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadAccounts, saveAccounts, ID_RE } = require('./lib/accounts-store');
const { startAccount } = require('./multi-start');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// Pakai readline sebagai async iterator (bukan rl.question() berulang kali):
// rl.question() bisa kehilangan jawaban yang sudah ada di buffer input kalau
// dipanggil lagi setelah baris sebelumnya, terutama saat input tidak datang
// dari keyboard langsung (mis. lewat skrip atau redirect).
const lineIterator = rl[Symbol.asyncIterator]();
async function ask(promptText) {
  process.stdout.write(promptText);
  const { value, done } = await lineIterator.next();
  return done ? '' : value;
}

function normalizeNumber(input) {
  let n = String(input || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1); // 0812... -> 62812...
  return n;
}

function printAccounts(accounts) {
  if (accounts.length === 0) {
    console.log('(belum ada akun)');
    return;
  }
  accounts.forEach((a, i) => {
    const extra = [];
    if (a.forwardTo !== undefined) extra.push(`forward ke ${a.forwardTo || '(chat asal)'}`);
    console.log(`  ${i + 1}. ${a.id}  —  ${a.pairingNumber || '(login pakai QR)'}${extra.length ? '  [' + extra.join(', ') + ']' : ''}`);
  });
}

async function addAccount(accounts) {
  console.log('\n--- Tambah akun ---');
  let id;
  for (;;) {
    id = (await ask('ID akun (bebas, mis. akun1, tanpa spasi): ')).trim();
    if (!id) { console.log('ID tidak boleh kosong.'); continue; }
    if (!ID_RE.test(id)) { console.log('Hanya huruf, angka, "-" atau "_" yang boleh.'); continue; }
    if (accounts.some((a) => a.id === id)) { console.log(`ID "${id}" sudah dipakai, pilih yang lain.`); continue; }
    break;
  }

  const numberInput = await ask('Nomor WhatsApp akun ini, kode negara tanpa + atau spasi (kosongkan untuk login pakai QR): ');
  const pairingNumber = normalizeNumber(numberInput);

  const forwardInput = await ask('Kirim hasil foto ke nomor lain? (Enter = balas di chat asal, atau ketik nomornya): ');
  const account = { id, pairingNumber };
  if (forwardInput.trim()) account.forwardTo = normalizeNumber(forwardInput);

  accounts.push(account);
  saveAccounts(accounts);
  console.log(`✅ Akun "${id}" ditambahkan ke data/accounts.json.`);

  const runNow = (await ask('Jalankan akun ini sekarang? (y/n): ')).trim().toLowerCase();
  if (runNow === 'y' || runNow === 'yes') {
    console.log(`\n🚀 Menjalankan akun "${id}"... (Ctrl+C untuk berhenti, lalu buka lagi dengan "node manage.js")\n`);
    rl.close();
    startAccount(account);
    await new Promise(() => {}); // tetap berjalan sampai Ctrl+C
  }
  return accounts;
}

async function removeAccount(accounts) {
  console.log('\n--- Hapus akun ---');
  if (accounts.length === 0) {
    console.log('Belum ada akun untuk dihapus.');
    return accounts;
  }
  printAccounts(accounts);
  const pick = (await ask('Nomor akun yang mau dihapus (Enter untuk batal): ')).trim();
  if (!pick) return accounts;

  const idx = parseInt(pick, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= accounts.length) {
    console.log('Nomor tidak valid.');
    return accounts;
  }

  const [removed] = accounts.splice(idx, 1);
  saveAccounts(accounts);
  console.log(`🗑️  Akun "${removed.id}" dihapus dari daftar.`);

  const delSession = (await ask(`Hapus juga folder sesi login "session_${removed.id}"? Akun akan perlu login ulang nanti. (y/n): `)).trim().toLowerCase();
  if (delSession === 'y' || delSession === 'yes') {
    try {
      fs.rmSync(path.join(__dirname, `session_${removed.id}`), { recursive: true, force: true });
      console.log('Folder sesi dihapus.');
    } catch (err) {
      console.log('Gagal menghapus folder sesi:', err.message);
    }
  }
  return accounts;
}

async function runAll(accounts) {
  if (accounts.length === 0) {
    console.log('Belum ada akun. Tambah dulu lewat menu 1.');
    return;
  }
  console.log(`\n🚀 Menjalankan ${accounts.length} akun: ${accounts.map((a) => a.id).join(', ')}`);
  console.log('(Ctrl+C untuk berhenti)\n');
  rl.close();
  accounts.forEach((a) => startAccount(a));
  await new Promise(() => {}); // tetap berjalan sampai Ctrl+C
}

async function main() {
  let accounts = loadAccounts({ required: false });

  for (;;) {
    console.log('\n=== Kelola Akun WhatsApp Bot ===');
    printAccounts(accounts);
    console.log('\n1. Tambah akun');
    console.log('2. Hapus akun');
    console.log('3. Jalankan semua akun');
    console.log('4. Keluar');
    const choice = (await ask('Pilih (1-4): ')).trim();

    if (choice === '1') {
      accounts = await addAccount(accounts);
    } else if (choice === '2') {
      accounts = await removeAccount(accounts);
    } else if (choice === '3') {
      await runAll(accounts);
      return;
    } else if (choice === '4') {
      console.log('Sampai jumpa!');
      rl.close();
      return;
    } else {
      console.log('Pilihan tidak dikenal, ketik angka 1-4.');
    }
  }
}

main();
