/**
 * Launcher multi-akun.
 *
 * Secara default `node index.js` hanya menjalankan satu akun WhatsApp. File
 * ini menjalankan BEBERAPA akun sekaligus, masing-masing sebagai proses
 * sendiri dengan folder sesi, QR/pairing code, dan (opsional) tujuan forward
 * sendiri-sendiri — satu akun tidak akan mengganggu akun lain.
 *
 * Pemakaian:
 *   1. cp data/accounts.example.json data/accounts.json
 *   2. Isi data/accounts.json dengan daftar akun, contoh:
 *        [
 *          { "id": "akun1", "pairingNumber": "6281234567890" },
 *          { "id": "akun2", "pairingNumber": "6289876543210" }
 *        ]
 *   3. node multi-start.js   (atau: npm run start:multi)
 *   4. Kode pairing tiap akun muncul berlabel [akun1], [akun2], dst. Tautkan
 *      masing-masing lewat WhatsApp > Perangkat Tertaut seperti biasa.
 *
 * Field per akun (hanya "id" yang wajib):
 *   id            - nama unik akun (huruf/angka/"-"/"_"), dipakai sebagai label & nama folder sesi
 *   pairingNumber - nomor WhatsApp akun ini untuk login kode pairing (kosongkan untuk pakai QR)
 *   forwardTo     - override config.forwardTo khusus akun ini (opsional)
 *   ownerNumbers  - override config.ownerNumber khusus akun ini, array string (opsional)
 *   onlyOwner     - override config.onlyOwner khusus akun ini, true/false (opsional)
 *
 * Setiap akun menyimpan sesinya sendiri di session_<id>/ agar tidak bentrok.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ACCOUNTS_FILE = path.join(__dirname, 'data', 'accounts.json');
const EXAMPLE_FILE = path.join(__dirname, 'data', 'accounts.example.json');
const RESTART_DELAY_MS = 5000;

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error(`Tidak ditemukan ${ACCOUNTS_FILE}`);
    console.error(`Buat dulu dari contohnya:\n  cp ${path.relative(__dirname, EXAMPLE_FILE)} ${path.relative(__dirname, ACCOUNTS_FILE)}`);
    process.exit(1);
  }

  let accounts;
  try {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
  } catch (err) {
    console.error(`Gagal membaca ${ACCOUNTS_FILE}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(accounts) || accounts.length === 0) {
    console.error(`${ACCOUNTS_FILE} harus berupa array berisi minimal satu akun.`);
    process.exit(1);
  }

  const seenIds = new Set();
  for (const acc of accounts) {
    if (!acc || typeof acc.id !== 'string' || !acc.id.trim()) {
      console.error('Setiap akun wajib punya "id" (string), contoh: "akun1".');
      process.exit(1);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(acc.id)) {
      console.error(`id akun "${acc.id}" tidak valid — gunakan huruf, angka, "-" atau "_" saja.`);
      process.exit(1);
    }
    if (seenIds.has(acc.id)) {
      console.error(`id akun "${acc.id}" duplikat — setiap akun butuh id unik.`);
      process.exit(1);
    }
    seenIds.add(acc.id);
  }

  return accounts;
}

function prefixStream(stream, label) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => console.log(`[${label}] ${line}`));
}

const runningChildren = new Set();

function startAccount(account) {
  let shuttingDown = false;

  const launch = () => {
    const env = {
      ...process.env,
      ACCOUNT_ID: account.id,
      SESSION_DIR: path.join('.', `session_${account.id}`),
    };
    if (account.pairingNumber) env.PAIRING_NUMBER = account.pairingNumber;
    if (account.forwardTo !== undefined) env.FORWARD_TO = account.forwardTo;
    if (account.ownerNumbers !== undefined) env.OWNER_NUMBERS = account.ownerNumbers.join(',');
    if (account.onlyOwner !== undefined) env.ONLY_OWNER = String(account.onlyOwner);

    const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    prefixStream(child.stdout, account.id);
    prefixStream(child.stderr, account.id);

    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      console.log(`[${account.id}] proses berhenti (code=${code} signal=${signal}), restart dalam ${RESTART_DELAY_MS / 1000}s...`);
      setTimeout(launch, RESTART_DELAY_MS);
    });

    runningChildren.add(child);
    child.once('exit', () => runningChildren.delete(child));
  };

  launch();
  return () => { shuttingDown = true; };
}

function main() {
  const accounts = loadAccounts();
  console.log(`Menjalankan ${accounts.length} akun: ${accounts.map((a) => a.id).join(', ')}`);

  const stopFns = accounts.map((account) => startAccount(account));

  const shutdown = () => {
    console.log('\nMenghentikan semua akun...');
    stopFns.forEach((stop) => stop());
    for (const child of runningChildren) child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
