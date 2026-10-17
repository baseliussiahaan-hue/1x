# ViewOnce Photo Bot

Bot WhatsApp minimal berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) dengan **satu fitur saja**: membuka **foto sekali lihat (view once)**.

Dipangkas dari [KnightBot-Mini](https://github.com/mruniquehacker/KnightBot-Mini) (lisensi MIT). Semua fitur lain (admin, AI, sticker, game, dll.) dihapus; video dan audio view-once juga tidak didukung.

## Cara pakai

1. Balas (reply) foto sekali lihat dengan perintah:

   ```
   ,vv
   ```

   Alias: `,viewonce`, `,readvo`, `,readviewonce`
2. Bot mengirim ulang foto itu sebagai foto biasa beserta captionnya.

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

## Konfigurasi (`config.js`)

| Opsi | Keterangan |
| --- | --- |
| `prefix` | Awalan perintah (default `,`) |
| `ownerNumber` | Daftar nomor yang boleh memakai bot, tanpa `+`, mis. `['6281234567890']` |
| `onlyOwner` | `true` = hanya akun bot + `ownerNumber`; `false` = semua orang |
| `commands` | Daftar nama perintah yang memicu fitur |

## Catatan penting

- Bukan bot resmi WhatsApp. Memakai bot pihak ketiga dapat melanggar Ketentuan Layanan WhatsApp dan berisiko membuat akun diblokir. Pakai dengan risiko sendiri.
- Foto sekali lihat dikirim dengan harapan privasi dari pengirimnya. Gunakan hanya untuk kebutuhan yang wajar dan dengan sepengetahuan pengirim.
- Foto hanya bisa dibuka jika perangkat bot menerima isi medianya.

## Lisensi

MIT. Lihat [LICENSE](LICENSE). Berasal dari KnightBot-Mini oleh Mr Unique Hacker (MIT).
