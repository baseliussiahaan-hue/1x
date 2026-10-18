/**
 * Menu interaktif untuk kelola akun WhatsApp bot — tidak perlu edit
 * data/accounts.json manual.
 *
 *   node manage.js   (atau: npm run accounts)
 *
 * Pilih nomor menunya:
 *   1. Tambah akun   - isi id + nomor WhatsApp, langsung bisa dijalankan
 *   2. Edit akun     - ganti nomor pairing, prefix, atau tujuan forward akun yang sudah ada
 *   3. Hapus akun    - pilih dari daftar, folder sesinya juga bisa dihapus
 *   4. Jalankan semua akun
 *   5. Keluar
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
    if (a.prefix !== undefined) extra.push(`prefix "${a.prefix}"`);
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
  const account = { id, pairingNumber: normalizeNumber(numberInput) };

  const prefixInput = (await ask('Prefix perintah khusus akun ini? (Enter = pakai default di config.js, mis. ","): ')).trim();
  if (prefixInput) account.prefix = prefixInput;

  const forwardInput = (await ask('Kirim hasil foto ke nomor lain? (Enter = pakai default config.js, "-" = balas di chat asal, atau ketik nomornya): ')).trim();
  if (forwardInput === '-') account.forwardTo = '';
  else if (forwardInput) account.forwardTo = normalizeNumber(forwardInput);

  accounts.push(account);
  saveAccounts(accounts);
  console.log(`✅ Akun "${id}" ditambahkan ke data/accounts.json.`);

  console.log('Pilih menu "Jalankan semua akun" untuk menjalankan akun yang baru ditambahkan.');
  return accounts;
}

function pickAccount(accounts, promptText) {
  printAccounts(accounts);
  return ask(promptText).then((pick) => {
    pick = pick.trim();
    if (!pick) return -1;
    const idx = parseInt(pick, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= accounts.length) {
      console.log('Nomor tidak valid.');
      return -1;
    }
    return idx;
  });
}

async function editAccount(accounts) {
  console.log('\n--- Edit akun ---');
  if (accounts.length === 0) {
    console.log('Belum ada akun untuk diedit.');
    return accounts;
  }
  const idx = await pickAccount(accounts, 'Nomor akun yang mau diedit (Enter untuk batal): ');
  if (idx === -1) return accounts;
  const account = accounts[idx];

  for (;;) {
    console.log(`\n--- Edit akun "${account.id}" ---`);
    console.log(`  1. Nomor pairing : ${account.pairingNumber || '(pakai QR)'}`);
    console.log(`  2. Prefix        : ${account.prefix !== undefined ? account.prefix : '(default config.js)'}`);
    console.log(`  3. Forward ke    : ${account.forwardTo !== undefined ? (account.forwardTo || '(chat asal)') : '(default config.js)'}`);
    console.log('  4. Kembali ke menu utama');
    const sub = (await ask('Mau ganti yang mana (1-4)? ')).trim();

    if (sub === '1') {
      const numberInput = await ask('Nomor WhatsApp baru, kode negara tanpa + atau spasi (kosongkan untuk login pakai QR): ');
      account.pairingNumber = normalizeNumber(numberInput);
      saveAccounts(accounts);
      console.log('✅ Nomor pairing diperbarui. Kalau akun ini sudah pernah login, sesi lama tetap dipakai sampai dihapus.');
    } else if (sub === '2') {
      const prefixInput = (await ask('Prefix baru, mis. "," atau "." (Enter = pakai default di config.js): ')).trim();
      if (prefixInput) account.prefix = prefixInput;
      else delete account.prefix;
      saveAccounts(accounts);
      console.log('✅ Prefix diperbarui.');
    } else if (sub === '3') {
      const forwardInput = (await ask('Kirim hasil foto ke nomor lain? (Enter = pakai default config.js, "-" = balas di chat asal, atau ketik nomornya): ')).trim();
      if (!forwardInput) delete account.forwardTo;
      else if (forwardInput === '-') account.forwardTo = '';
      else account.forwardTo = normalizeNumber(forwardInput);
      saveAccounts(accounts);
      console.log('✅ Tujuan forward diperbarui.');
    } else if (sub === '4') {
      break;
    } else {
      console.log('Pilihan tidak dikenal, ketik angka 1-4.');
    }
  }

  console.log('(Kalau akun ini sedang berjalan, jalankan ulang lewat menu "Jalankan semua akun" agar perubahan dipakai.)');
  return accounts;
}

async function removeAccount(accounts) {
  console.log('\n--- Hapus akun ---');
  if (accounts.length === 0) {
    console.log('Belum ada akun untuk dihapus.');
    return accounts;
  }
  const idx = await pickAccount(accounts, 'Nomor akun yang mau dihapus (Enter untuk batal): ');
  if (idx === -1) return accounts;

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

async function saveCommands(commands) {
  const configPath = path.join(__dirname, 'config.js');
  const source = fs.readFileSync(configPath, 'utf8');
  const updated = source.replace(/commands:\s*\[[^\]]*\]/, 'commands: ' + JSON.stringify([...new Set(commands)]));
  if (updated === source) throw new Error('Baris commands tidak ditemukan di config.js');
  fs.writeFileSync(configPath, updated, 'utf8');
}

async function editCommands() {
  const configPath = path.join(__dirname, 'config.js');
  const config = require('./config');
  console.log('\nCommand aktif: ' + (config.commands || []).join(', '));
  console.log('1. Ganti semua command');
  console.log('2. Tambah command');
  console.log('3. Kembali');
  const choice = (await ask('Pilih (1-3): ')).trim();
  if (choice === '3' || !choice) return;
  if (choice !== '1' && choice !== '2') {
    console.log('Pilihan tidak valid.');
    return;
  }
  const answer = await ask(choice === '1'
    ? 'Daftar command, pisahkan dengan koma (contoh: vv, apa coba): '
    : 'Command baru (contoh: apa coba): ');
  const items = answer.split(',').map((item) => item.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter((item) => /^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/.test(item));
  if (!items.length) {
    console.log('Command tidak valid; tidak ada perubahan.');
    return;
  }
  const commands = choice === '1'
    ? [...new Set(items)]
    : [...new Set([...(config.commands || []), ...items])];
  try {
    await saveCommands(commands);
    const resolved = require.resolve('./config');
    delete require.cache[resolved];
    console.log('Command tersimpan: ' + commands.join(', '));
    console.log('Command baru aktif pada pesan berikutnya.');
  } catch (err) {
    console.log('Gagal menyimpan command: ' + err.message);
  }
}

async function runAll(accounts) {
  if (accounts.length === 0) {
    console.log('Belum ada akun. Tambahkan akun terlebih dahulu.');
    return;
  }
  console.log('\nMenjalankan ' + accounts.length + ' akun: ' + accounts.map((a) => a.id).join(', '));
  console.log('Menu ini tetap tersedia saat bot berjalan.');
  const stopFns = accounts.map((a) => startAccount(a));
  let stop = false;
  while (!stop) {
    console.log('\n=== BOT BERJALAN ===');
    console.log('1. Ganti semua command');
    console.log('2. Tambah command baru');
    console.log('3. Hentikan bot dan kembali ke menu akun');
    const choice = (await ask('Pilih (1-3): ')).trim();
    if (choice === '1') {
      const config = require('./config');
      const answer = await ask('Daftar command dipisahkan koma (contoh: vv, apa coba): ');
      const items = answer.split(',').map((item) => item.trim().replace(/\s+/g, ' ').toLowerCase())
        .filter((item) => /^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/.test(item));
      if (!items.length) { console.log('Command tidak valid; tidak ada perubahan.'); continue; }
      try {
        await saveCommands([...new Set(items)]);
        console.log('Command tersimpan: ' + [...new Set(items)].join(', '));
      } catch (err) { console.log('Gagal menyimpan command: ' + err.message); }
    } else if (choice === '2') {
      const config = require('./config');
      const answer = await ask('Command baru (contoh: apa coba): ');
      const item = answer.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!/^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/.test(item)) {
        console.log('Command tidak valid.');
        continue;
      }
      try {
        const commands = [...new Set([...(config.commands || []), item])];
        await saveCommands(commands);
        console.log('Command ditambahkan: ' + item);
      } catch (err) { console.log('Gagal menyimpan command: ' + err.message); }
    } else if (choice === '3') {
      stop = true;
    } else {
      console.log('Pilihan tidak valid.');
    }
  }
  console.log('Menghentikan semua akun...');
  stopFns.forEach((fn) => fn());
  require('./multi-start').stopAllRunning();
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

async function main() {
  let accounts = loadAccounts({ required: false });
  for (;;) {
    console.log('\n=== MENU UTAMA BOT WHATSAPP ===');
    printAccounts(accounts);
    console.log('\n1. Tambah akun');
    console.log('2. Edit akun');
    console.log('3. Hapus akun');
    console.log('4. Jalankan semua akun');
    console.log('5. Ganti/tambah command');
    console.log('6. Keluar');
    const choice = (await ask('Pilih (1-6): ')).trim();
    try {
      if (choice === '1') {
        accounts = await addAccount(accounts);
      } else if (choice === '2') {
        accounts = await editAccount(accounts);
      } else if (choice === '3') {
        accounts = await removeAccount(accounts);
      } else if (choice === '4') {
        await runAll(accounts);
        accounts = loadAccounts({ required: false });
      } else if (choice === '5') {
        await editCommands();
      } else if (choice === '6') {
        console.log('Sampai jumpa!');
        rl.close();
        return;
      } else {
        console.log('Pilihan tidak valid, ketik angka 1-6.');
      }
    } catch (err) {
      console.error('Terjadi kesalahan:', err.message);
    }
  }
}

main();
