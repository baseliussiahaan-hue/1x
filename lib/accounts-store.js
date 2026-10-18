/**
 * Baca/tulis data/accounts.json, dipakai bersama oleh multi-start.js dan manage.js
 * supaya aturan validasinya selalu konsisten di satu tempat.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ACCOUNTS_FILE = path.join(ROOT, 'data', 'accounts.json');
const EXAMPLE_FILE = path.join(ROOT, 'data', 'accounts.example.json');
const ID_RE = /^[a-zA-Z0-9_-]+$/;

function validateAccounts(accounts) {
  if (!Array.isArray(accounts)) {
    console.error(`${ACCOUNTS_FILE} harus berupa array akun.`);
    process.exit(1);
  }
  const seen = new Set();
  for (const acc of accounts) {
    if (!acc || typeof acc.id !== 'string' || !acc.id.trim()) {
      console.error('Setiap akun wajib punya "id" (string), contoh: "akun1".');
      process.exit(1);
    }
    if (!ID_RE.test(acc.id)) {
      console.error(`id akun "${acc.id}" tidak valid — gunakan huruf, angka, "-" atau "_" saja.`);
      process.exit(1);
    }
    if (seen.has(acc.id)) {
      console.error(`id akun "${acc.id}" duplikat — setiap akun butuh id unik.`);
      process.exit(1);
    }
    seen.add(acc.id);
  }
}

/**
 * @param {{ required?: boolean }} opts
 *   required=true (default): keluar dengan pesan error kalau data/accounts.json
 *   belum ada atau kosong — dipakai saat langsung menjalankan bot (multi-start.js).
 *   required=false: kembalikan array kosong kalau file belum ada — dipakai oleh
 *   menu interaktif (manage.js) supaya bisa membuat akun pertama dari menu.
 */
function loadAccounts({ required = true } = {}) {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    if (!required) return [];
    console.error(`Tidak ditemukan ${ACCOUNTS_FILE}`);
    console.error(`Buat dulu dari contohnya:\n  cp ${path.relative(ROOT, EXAMPLE_FILE)} ${path.relative(ROOT, ACCOUNTS_FILE)}`);
    console.error('Atau pakai menu interaktif: node manage.js');
    process.exit(1);
  }

  let accounts;
  try {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
  } catch (err) {
    console.error(`Gagal membaca ${ACCOUNTS_FILE}: ${err.message}`);
    process.exit(1);
  }

  if (required && (!Array.isArray(accounts) || accounts.length === 0)) {
    console.error(`${ACCOUNTS_FILE} harus berisi minimal satu akun.`);
    process.exit(1);
  }

  validateAccounts(accounts);
  return accounts;
}

function saveAccounts(accounts) {
  validateAccounts(accounts);
  fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2) + '\n');
}

module.exports = { ACCOUNTS_FILE, EXAMPLE_FILE, ID_RE, loadAccounts, saveAccounts, validateAccounts };
