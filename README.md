# ViewOnce Photo Bot

Bot WhatsApp minimal berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) dengan **satu fitur saja**: membuka **foto sekali lihat (view once)**.

Dipangkas dari [KnightBot-Mini](https://github.com/mruniquehacker/KnightBot-Mini) (lisensi MIT). Semua fitur lain (admin, AI, sticker, game, dll.) dihapus; video dan audio view-once juga tidak didukung.

## Cara pakai

Ada dua cara memicunya:

**A. Reaksi (paling cepat):** tekan lama foto sekali lihat lalu beri reaksi emoji apa saja (atau emoji yang diatur di `reactionEmojis`). Hanya foto yang masuk setelah bot menyala yang bisa dibuka.

**B. Perintah:**

1. Balas (reply) foto sekali lihat dengan perintah:

   ```
   ,vv
   ```

   Alias: `,viewonce`, `,readvo`, `,readviewonce`
2. Bot mengirim ulang foto itu sebagai foto biasa beserta captionnya, ke nomor di `forwardTo` (atau dibalas di chat asal jika kosong). Bot tidak memberi reaksi apa pun ke pesan perintahnya.

Secara default hanya akun yang menjalankan bot (dan nomor di `ownerNumber`) yang bisa memakai perintah.

## Instalasi

Butuh Node.js 18+.

```bash
git clone <url-repo-kamu>
cd viewonce-photo-bot
npm install
node index.js
```

Saat pertama dijalankan, bot menanyakan nomor WhatsApp-mu.

- **Login dengan kode (disarankan, tanpa scan):** ketik nomor dengan kode negara, mis. `6281234567890`. Bot menampilkan kode 8 karakter. Di WhatsApp buka **Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon saja**, lalu masukkan kodenya.
- **Login dengan QR:** tekan Enter saja, lalu scan QR di terminal lewat **Perangkat Tertaut**.

Nomor juga bisa diisi lewat `pairingNumber` di `config.js` atau env `PAIRING_NUMBER`. Sesi tersimpan di folder `session/`.

## Menjalankan beberapa akun sekaligus

Secara default `node index.js` hanya login satu akun WhatsApp. Untuk menjalankan lebih dari satu akun bersamaan (masing-masing dengan sesi, QR/pairing code, dan folder sendiri), ada dua cara:

### Cara mudah: menu interaktif

```bash
npm run accounts
```

(atau `node manage.js`). Akan muncul menu:

```
1. Tambah akun
2. Edit akun (ganti nomor, prefix, forward)
3. Hapus akun
4. Jalankan semua akun
5. Keluar
```

- **1. Tambah akun** — tinggal ketik id bebas (mis. `akun1`) dan nomor WhatsApp-nya, boleh juga langsung isi prefix/tujuan forward khusus akun itu; bisa langsung ditanya "jalankan sekarang?" untuk langsung menampilkan kode pairing akun itu.
- **2. Edit akun** — pilih akun dari daftar, lalu ganti nomor pairing, prefix perintah, atau tujuan forward-nya tanpa harus hapus dan tambah ulang.
- **3. Hapus akun** — pilih dari daftar, dan bisa sekalian menghapus folder sesinya.
- **4. Jalankan semua akun** — menyalakan semua akun yang sudah tersimpan sekaligus.

Tidak perlu edit file apa pun secara manual — menu ini yang mengurus `data/accounts.json`.

### Cara manual: edit file sendiri

1. **Buat daftar akun:**

   ```bash
   cp data/accounts.example.json data/accounts.json
   ```

   Isi `data/accounts.json`, contoh:

   ```json
   [
     { "id": "akun1", "pairingNumber": "6281234567890" },
     { "id": "akun2", "pairingNumber": "6289876543210", "prefix": ".", "forwardTo": "6281234567890" }
   ]
   ```

   - `id`: nama unik akun (huruf/angka/`-`/`_`), dipakai sebagai label log dan nama folder sesi.
   - `pairingNumber`: nomor WhatsApp akun ini untuk login kode pairing. Kosongkan untuk login pakai QR (QR akan muncul di terminal dan juga disimpan sebagai `qr_<id>.png`).
   - `prefix`, `forwardTo`, `ownerNumbers`, `onlyOwner`: opsional, meng-override nilai di `config.js` khusus untuk akun tersebut.

2. **Jalankan semua akun:**

   ```bash
   npm run start:multi
   ```

   Tiap akun berjalan sebagai proses sendiri, log-nya berlabel `[akun1]`, `[akun2]`, dst. Kode pairing/QR tiap akun muncul terpisah — tautkan satu per satu lewat WhatsApp seperti biasa. Kalau salah satu proses crash, otomatis di-restart.

Setiap akun punya folder sesi sendiri (`session_<id>/`), jadi akun-akun tidak akan saling menimpa atau mengganggu satu sama lain.

## Konfigurasi (`config.js`)

| Opsi | Keterangan |
| --- | --- |
| `prefix` | Awalan perintah (default `,`) |
| `ownerNumber` | Daftar nomor yang boleh memakai bot, tanpa `+`, mis. `['6281234567890']` |
| `onlyOwner` | `true` = hanya akun bot + `ownerNumber`; `false` = semua orang |
| `forwardTo` | Nomor tujuan hasil foto (kode negara, tanpa `+`). Kosong = balas di chat asal |
| `reactionTrigger` | `true` = reaksi emoji pada foto sekali lihat memicu bot |
| `reactionEmojis` | Batasi emoji pemicu, mis. `['🐵']`. Kosong = emoji apa pun |
| `commands` | Daftar nama perintah yang memicu fitur |

## Catatan penting

- Bukan bot resmi WhatsApp. Memakai bot pihak ketiga dapat melanggar Ketentuan Layanan WhatsApp dan berisiko membuat akun diblokir. Pakai dengan risiko sendiri.
- Foto sekali lihat dikirim dengan harapan privasi dari pengirimnya. Gunakan hanya untuk kebutuhan yang wajar dan dengan sepengetahuan pengirim.
- Foto hanya bisa dibuka jika perangkat bot menerima isi medianya.

## Lisensi

MIT. Lihat [LICENSE](LICENSE). Berasal dari KnightBot-Mini oleh Mr Unique Hacker (MIT).
