# D-Fixer-POS
Aplikasi kasir offline-first untuk cafetaria, kantin, dan kafe.

Dokumen kebutuhan produk: [PRD.md](./PRD.md).

## Fitur MVP yang sudah diimplementasikan
- Login lokal dengan PIN yang di-hash menggunakan PBKDF2 dan salt acak.
- Pengelolaan produk dan kategori.
- Keranjang transaksi dan pembayaran tunai.
- Pencatatan transaksi lokal dengan nomor struk unik.
- Laporan penjualan dasar.
- Pengaturan usaha dan struk.
- Cetak otomatis setelah transaksi selesai dan cetak ulang struk melalui dialog cetak perangkat dengan tata letak kertas 58 mm atau 80 mm.
- Hak akses owner, supervisor, dan kasir diterapkan di API serta dibatasi tampilannya sesuai peran.
- Laporan dapat difilter berdasarkan rentang tanggal, menghitung penjualan dari transaksi selesai, dan menampilkan pembatalan terpisah.
- Riwayat transaksi dapat dicari berdasarkan nomor struk dan rentang tanggal.
- Pemilik dapat membatalkan transaksi selesai dengan alasan; pembatalan tercatat dan tidak dapat dilakukan dua kali.
- Cloud opsional dengan antrean sinkronisasi aman.
- Arsitektur offline-first berbasis SQLite.

Untuk browser, hubungkan printer thermal melalui pengaturan sistem lalu pilih layanan cetak yang kompatibel di dialog cetak Android. Browser menyerahkan halaman/gambar ke Android Print Framework; print service harus mengubahnya ke format yang didukung printer. Memasangkan printer Bluetooth atau merender struk sebagai gambar saja tidak menjamin kompatibilitas. Pastikan gunakan print service resmi yang mendukung model printer.

Setelah transaksi selesai, dialog cetak struk akan dibuka otomatis. Izinkan pop-up browser agar dialog dapat muncul. Kegagalan atau pop-up yang diblokir tidak membatalkan transaksi; struk transaksi dapat dicetak ulang dari menu Riwayat.

Pemilik dapat mengelola produk, akun, perangkat, pengaturan, cloud, serta backup. Supervisor dapat melihat riwayat dan laporan. Kasir dapat memproses transaksi dan hanya melihat riwayat transaksinya sendiri. Perubahan hak akses divalidasi di server, bukan hanya dengan menyembunyikan menu.

Pada penggunaan pertama, login sebagai pemilik lalu daftarkan perangkat yang sedang digunakan pada menu **Akun & Perangkat**. Kasir hanya dapat login dari perangkat yang terdaftar dan aktif.

### Sinkronisasi cloud

Cloud tidak menandai data sebagai terkirim secara simulasi. Untuk mengaktifkannya, sediakan endpoint batch HTTPS yang menerima `POST` berisi `{ "events": [{ "event_id", "entity_type", "entity_id", "payload" }] }`, autentikasi Bearer, dan mengembalikan `{ "accepted_ids": ["..."] }`. Endpoint harus memproses `event_id` secara idempoten. Atur `DFIXER_CLOUD_TOKEN` pada lingkungan server, lalu isi URL endpoint tersebut pada menu Cloud. Item hanya ditandai tersinkron setelah ID-nya diakui endpoint; item yang tidak diakui tetap dalam antrean lokal.

Cadangan ekspor menggunakan enkripsi AES-256-GCM dengan kunci turunan scrypt. Gunakan kata sandi 12-256 karakter, simpan secara terpisah dari file cadangan, dan uji pemulihan secara berkala. Pemulihan menggabungkan atau memperbarui baris berdasarkan ID; akun pengguna dengan ID berbeda dicocokkan berdasarkan username dan referensi transaksi serta audit disesuaikan. Data lokal yang tidak terdapat dalam cadangan tidak dihapus.

## Cara menjalankan
1. Instal dependensi: `npm install`
2. (Opsional) Bangun bundle frontend: `npm run build`. Perintah `npm start` juga membangun bundle secara otomatis.
3. Jalankan aplikasi: `npm start`
4. Buka `http://localhost:3000`
5. Login dengan akun default:
   - Username: `owner`
   - PIN: `123456`
6. Segera ubah PIN bawaan dari menu **Akun & Perangkat**. PIN hanya diterima 4-6 angka.

Webpack menggabungkan JavaScript frontend menjadi `public/build/app.js`. Berkas hasil build dibuat otomatis saat menjalankan `npm start`; stylesheet tetap disajikan sebagai berkas CSS terpisah.
Proyek membutuhkan Node.js 20.17.0 atau lebih baru.

## Verifikasi
- `npm test` untuk menjalankan uji unit dan integrasi API.
- `curl http://localhost:3000/api/health` untuk mengecek server.

### Pemulihan PIN pemilik

Jika PIN pemilik hilang, hentikan server dan jalankan `npm run owner:reset` dari terminal interaktif di folder proyek. Masukkan PIN baru 4-6 angka saat diminta; input tidak ditampilkan. Mulai server kembali setelah berhasil. Perintah ini memerlukan akses sistem operasi ke file database lokal; sesi lama akan hilang saat server dihentikan. Jangan menjalankan perintah saat server sedang aktif.

## Batas kesiapan rilis

Fitur POS inti telah diuji dengan test unit dan API terisolasi. Sebelum disebut siap produksi, tetap lakukan uji penerimaan pada tablet Android sasaran, uji printer thermal Bluetooth tertentu, pemulihan cadangan pada perangkat terpisah, dan integrasi endpoint cloud milik usaha. Web Bluetooth bukan jalur pencetakan yang universal; versi ini membuka dialog cetak browser agar perangkat memilih printer yang dipasangkan oleh sistem operasi.
