/**
 * Launcher multi-akun (non-interaktif).
 *
 * Membaca data/accounts.json dan menjalankan SEMUA akun yang ada di situ
 * sekaligus, masing-masing sebagai proses sendiri dengan folder sesi dan
 * QR/pairing code sendiri — satu akun tidak akan mengganggu akun lain.
 *
 * Kalau belum pernah menambah akun, lebih gampang pakai menu interaktif:
 *   node manage.js
 *
 * Pemakaian langsung (tanpa menu, cocok untuk panel hosting / cron):
 *   node multi-start.js   (atau: npm run start:multi)
 *
 * Field per akun di data/accounts.json (hanya "id" yang wajib):
 *   id            - nama unik akun (huruf/angka/"-"/"_"), dipakai sebagai label & nama folder sesi
 *   pairingNumber - nomor WhatsApp akun ini untuk login kode pairing (kosongkan untuk pakai QR)
 *   forwardTo     - override config.forwardTo khusus akun ini (opsional)
 *   ownerNumbers  - override config.ownerNumber khusus akun ini, array string (opsional)
 *   onlyOwner     - override config.onlyOwner khusus akun ini, true/false (opsional)
 *   prefix        - override config.prefix (awalan perintah) khusus akun ini (opsional)
 *
 * Setiap akun menyimpan sesinya sendiri di session_<id>/ agar tidak bentrok.
 */
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { loadAccounts } = require('./lib/accounts-store');

const RESTART_DELAY_MS = 5000;
const runningChildren = new Set();
const accountStops = new Map();

function prefixStream(stream, label) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => console.log(`[${label}] ${line}`));
}

/**
 * Jalankan satu akun sebagai proses index.js terpisah. Me-restart otomatis
 * kalau proses itu berhenti sendiri (crash), sampai stop() dipanggil.
 * @returns {() => void} stop - panggil untuk mematikan akun ini dan berhenti me-restart.
 */
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
    if (account.prefix !== undefined) env.PREFIX = account.prefix;

    const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
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
  const stop = () => {
    shuttingDown = true;
    const child = [...runningChildren].find((candidate) => candidate.env?.ACCOUNT_ID === account.id);
    if (child && child.connected) child.send({ type: 'logout' });
    else if (child) child.kill('SIGTERM');
  };
  accountStops.set(account.id, stop);
  return () => { stop(); accountStops.delete(account.id); };
}

function stopAccount(id) {
  const stop = accountStops.get(id);
  if (stop) stop();
  else for (const child of runningChildren) if (child.env?.ACCOUNT_ID === id) child.kill('SIGTERM');
}

function stopAllRunning() {
  for (const child of runningChildren) child.kill('SIGTERM');
}

function main() {
  const accounts = loadAccounts();
  console.log(`Menjalankan ${accounts.length} akun: ${accounts.map((a) => a.id).join(', ')}`);

  const stopFns = accounts.map((account) => startAccount(account));

  const shutdown = () => {
    console.log('\nMenghentikan semua akun...');
    stopFns.forEach((stop) => stop());
    stopAllRunning();
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main();
}

module.exports = { startAccount, stopAccount, stopAllRunning, runningChildren };
