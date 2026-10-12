PRODUCT REQUIREMENTS DOCUMENT (PRD)

D’FIXER POS

Sistem Aplikasi Kasir untuk Cafetaria, Kantin, dan Kafe

Versi Dokumen: 1.0
Status: Draft spesifikasi untuk pengembangan
Nama Produk: D’Fixer POS
Master Brand: D’Fixer
Platform Utama: Android Tablet
Bahasa Antarmuka: Bahasa Indonesia
Arsitektur: Offline-first dengan cloud opsional

---

1. Ringkasan Produk

D’Fixer POS adalah aplikasi Point of Sale (POS) yang dirancang untuk membantu operasional kasir pada cafetaria, kantin, dan kafe. Aplikasi berfokus pada kemudahan transaksi, pencatatan penjualan yang akurat, pengelolaan produk, laporan usaha, dan keamanan data.

Aplikasi harus tetap dapat digunakan ketika tidak ada koneksi internet. Seluruh transaksi disimpan terlebih dahulu pada database lokal perangkat. Apabila pemilik mengaktifkan fitur cloud, aplikasi dapat menyinkronkan data ke server secara aman dan mencegah duplikasi transaksi.

D’Fixer POS dikembangkan sebagai bagian dari ekosistem D’Fixer, yang ke depannya dapat mencakup produk seperti D’Fixer Parking dan D’Fixer Retail.

2. Visi dan Tujuan

2.1 Visi

Menjadi aplikasi kasir yang praktis, aman, dan dapat diandalkan oleh usaha kecil hingga menengah, khususnya cafetaria, kantin, dan kafe.

2.2 Tujuan Produk

1. Mempercepat proses transaksi kasir.
2. Memastikan transaksi tetap berjalan tanpa internet.
3. Mengurangi kesalahan pencatatan dan perhitungan.
4. Menyediakan laporan penjualan yang mudah dipahami.
5. Menjaga data transaksi agar aman dan tidak mudah hilang.
6. Mendukung printer thermal Bluetooth 58 mm dan 80 mm.
7. Memungkinkan pemilik mengaktifkan cloud tanpa harus mengganti aplikasi.
8. Mencegah transaksi ganda saat proses sinkronisasi.
9. Menyediakan fondasi untuk pengembangan fitur lanjutan.

3. Target Pengguna

3.1 Pemilik Usaha

Membutuhkan kontrol terhadap produk, harga, pengguna kasir, laporan penjualan, dan pengaturan aplikasi.

3.2 Kasir

Membutuhkan antarmuka sederhana untuk memilih produk, memproses pembayaran, dan mencetak struk.

3.3 Supervisor atau Manajer

Membutuhkan akses untuk memantau transaksi, melakukan pemeriksaan operasional, dan melihat laporan sesuai izin yang diberikan.

4. Ruang Lingkup Produk

4.1 Fitur MVP (Versi Awal)

- Login kasir menggunakan PIN lokal.
- Registrasi dan pengelolaan perangkat.
- Pengelolaan kategori dan produk.
- Keranjang belanja.
- Perhitungan subtotal dan total transaksi.
- Pembayaran tunai.
- Pencatatan transaksi offline.
- Riwayat transaksi.
- Cetak struk melalui printer thermal Bluetooth.
- Laporan penjualan dasar.
- Pengaturan identitas usaha.
- Pencadangan dan pemulihan data lokal yang aman.
- Pengaturan cloud opsional.
- Sinkronisasi data dengan mekanisme pencegahan duplikasi.

4.2 Fitur di Luar MVP

Fitur berikut dapat dikembangkan setelah versi awal stabil:

- Manajemen stok lanjutan dan resep bahan.
- Banyak cabang dan banyak perangkat kasir.
- Pembayaran QRIS atau integrasi payment gateway.
- Program loyalitas pelanggan.
- Manajemen pemasok dan pembelian.
- Integrasi akuntansi.
- Dashboard web pemilik.
- Analitik dan laporan lanjutan.
- Promosi, voucher, dan diskon kompleks.
- Integrasi aplikasi pemesanan.

Fitur di luar MVP tidak boleh menghambat penyelesaian fitur inti.

5. Platform dan Persyaratan Teknis

5.1 Perangkat

- Platform utama: tablet Android.
- Aplikasi harus nyaman digunakan dalam orientasi layar yang ditentukan pada tahap desain.
- Ukuran layar tablet harus diuji untuk memastikan tombol transaksi mudah disentuh.

5.2 Bahasa

Seluruh antarmuka, notifikasi, pesan kesalahan, pengaturan, dan struk menggunakan Bahasa Indonesia.

5.3 Printer

- Printer thermal Bluetooth.
- Kertas 58 mm dan 80 mm.
- Pemilihan printer dan lebar kertas tersedia di pengaturan.
- Aplikasi menyediakan uji koneksi dan cetak contoh.
- Kegagalan cetak tidak boleh menghapus atau menggandakan transaksi.

5.4 Arsitektur Offline-first

Database lokal merupakan sumber data operasional utama ketika aplikasi sedang offline. Transaksi harus disimpan secara persisten sebelum aplikasi menyatakan pembayaran berhasil.

Cloud bersifat opsional dan dapat diaktifkan kemudian oleh pemilik melalui pengaturan. Mengaktifkan cloud tidak boleh mengharuskan penginstalan ulang aplikasi atau menghapus transaksi lokal.

6. Peran dan Hak Akses

6.1 Pemilik (Owner)

- Mengelola profil usaha.
- Menambah, mengubah, dan menonaktifkan produk.
- Mengelola harga dan kategori.
- Membuat dan mengelola akun atau PIN kasir.
- Melihat semua laporan yang tersedia.
- Melihat dan mengelola riwayat transaksi sesuai kebijakan.
- Mengaktifkan dan menonaktifkan cloud.
- Mengelola perangkat yang terdaftar.
- Mengatur printer dan pencadangan data.

6.2 Kasir (Cashier)

- Login menggunakan PIN lokal.
- Membuat transaksi.
- Menerima pembayaran yang diizinkan.
- Mencetak ulang struk sesuai izin.
- Melihat transaksi sesuai batas akses.
- Tidak boleh mengubah konfigurasi keamanan, cloud, atau data usaha tanpa izin.

6.3 Supervisor (Opsional)

- Memeriksa transaksi dan laporan.
- Melakukan tindakan yang diberikan oleh pemilik.
- Tidak otomatis memperoleh hak akses pemilik.

Setiap tindakan sensitif harus mengikuti hak akses yang ditentukan dan dicatat dalam audit log apabila fitur audit tersedia.

7. Kebutuhan Fungsional

7.1 Autentikasi dan Perangkat

FR-001: Aplikasi menyediakan login menggunakan PIN lokal.

FR-002: PIN disimpan secara aman menggunakan mekanisme hashing yang sesuai, bukan dalam bentuk teks biasa.

FR-003: Aplikasi membedakan peran pemilik, kasir, dan supervisor apabila peran supervisor diaktifkan.

FR-004: Perangkat harus melalui proses registrasi sebelum digunakan sebagai perangkat kasir resmi.

FR-005: Aplikasi harus memiliki mekanisme pembatasan percobaan PIN dan penundaan sementara setelah kegagalan berulang.

FR-006: Aplikasi harus menyediakan prosedur pemulihan akses pemilik yang aman dan terdokumentasi.

7.2 Pengelolaan Produk

FR-007: Pemilik dapat menambahkan, mengubah, dan menonaktifkan produk.

FR-008: Setiap produk sekurang-kurangnya memiliki nama, kategori, harga, dan status aktif.

FR-009: Sistem harus memvalidasi harga agar tidak bernilai negatif.

FR-010: Produk nonaktif tidak boleh ditambahkan ke transaksi baru, tetapi tetap ditampilkan dalam riwayat transaksi lama.

FR-011: Perubahan harga tidak boleh mengubah harga yang sudah tercatat pada transaksi sebelumnya.

7.3 Transaksi Kasir

FR-012: Kasir dapat memilih produk dan memasukkannya ke keranjang.

FR-013: Kasir dapat mengubah jumlah item atau menghapus item sebelum transaksi diselesaikan.

FR-014: Sistem menghitung subtotal, diskon yang diizinkan, total, uang diterima, dan kembalian.

FR-015: Sistem menyimpan harga dan nama produk sebagai snapshot pada detail transaksi untuk menjaga riwayat tetap akurat.

FR-016: Sistem membuat identitas transaksi unik yang tidak bergantung pada koneksi internet.

FR-017: Transaksi tidak boleh dianggap berhasil sebelum tersimpan secara persisten di database lokal.

FR-018: Setelah transaksi selesai, aplikasi menampilkan status pembayaran dan pilihan cetak struk.

FR-019: Kegagalan cetak struk tidak boleh membuat transaksi baru secara otomatis.

FR-020: Aplikasi menyediakan mekanisme pembatalan atau pengembalian transaksi dengan izin yang sesuai serta menyimpan catatan tindakan tersebut.

7.4 Pembayaran

FR-021: MVP mendukung pembayaran tunai.

FR-022: Sistem memvalidasi bahwa uang diterima mencukupi total pembayaran.

FR-023: Sistem menghitung kembalian secara otomatis.

FR-024: Transaksi memiliki status yang jelas, misalnya draft, completed, atau cancelled, sesuai aturan alur transaksi.

FR-025: Transaksi selesai tidak boleh diubah diam-diam. Koreksi harus dilakukan melalui mekanisme pembatalan atau penyesuaian yang tercatat.

Metode pembayaran tambahan hanya boleh diaktifkan setelah kebutuhan dan integrasinya ditetapkan.

7.5 Struk dan Printer

FR-026: Sistem mendukung printer thermal Bluetooth 58 mm dan 80 mm.

FR-027: Pemilik dapat mengatur nama usaha, alamat, kontak, dan teks tambahan pada struk.

FR-028: Struk menampilkan identitas usaha, nomor transaksi, waktu transaksi, item, jumlah, harga, total, pembayaran, dan kembalian apabila relevan.

FR-029: Sistem menyediakan fungsi cetak ulang tanpa membuat transaksi baru.

FR-030: Jika printer terputus, transaksi tetap tersimpan dan dapat dicetak ulang setelah koneksi pulih.

7.6 Riwayat dan Laporan

FR-031: Aplikasi menyimpan riwayat transaksi secara lokal.

FR-032: Pengguna yang berwenang dapat mencari transaksi berdasarkan nomor transaksi atau rentang tanggal.

FR-033: Laporan penjualan menampilkan total penjualan, jumlah transaksi, dan ringkasan pembayaran untuk periode yang dipilih.

FR-034: Laporan harus membedakan transaksi selesai, pembatalan, dan pengembalian dana jika fitur tersebut diaktifkan.

FR-035: Nilai laporan harus dihitung dari data transaksi yang valid dan tidak memasukkan transaksi yang dibatalkan sebagai penjualan bersih.

7.7 Pengaturan Usaha

FR-036: Pemilik dapat mengatur nama usaha, alamat, nomor kontak, dan identitas pada struk.

FR-037: Pemilik dapat mengatur printer, format struk, dan preferensi operasional.

FR-038: Aplikasi menyediakan informasi versi aplikasi dan status database lokal.

7.8 Cloud Opsional dan Sinkronisasi

FR-039: Cloud dalam keadaan nonaktif secara default hingga pemilik mengaktifkannya melalui pengaturan.

FR-040: Sebelum aktivasi, aplikasi menjelaskan kebutuhan akun atau konfigurasi cloud, data yang akan disinkronkan, dan status koneksi.

FR-041: Setelah cloud diaktifkan, aplikasi dapat menyinkronkan transaksi dan data yang didukung ketika koneksi tersedia.

FR-042: Setiap transaksi menggunakan ID stabil yang unik agar pengiriman ulang tidak menciptakan transaksi duplikat.

FR-043: Sinkronisasi harus mendukung retry yang aman, status antrean, dan pemulihan setelah aplikasi ditutup atau perangkat kehilangan koneksi.

FR-044: Konflik perubahan data harus ditangani dengan aturan yang eksplisit. Transaksi yang telah selesai tidak boleh ditimpa secara diam-diam.

FR-045: Pemilik dapat melihat status sinkronisasi, waktu sinkronisasi terakhir, dan transaksi yang gagal disinkronkan.

FR-046: Menonaktifkan cloud menghentikan sinkronisasi berikutnya tetapi tidak menghapus transaksi lokal.

FR-047: Kegagalan cloud tidak boleh menghalangi kasir melakukan transaksi offline.

FR-048: Kredensial dan token cloud harus disimpan secara aman serta tidak dicatat ke log biasa.

7.9 Pencadangan dan Pemulihan

FR-049: Aplikasi menyediakan prosedur pencadangan data lokal yang aman.

FR-050: Aplikasi menyediakan prosedur pemulihan yang tervalidasi dan tidak langsung menimpa data tanpa konfirmasi.

FR-051: Pemilik diberi peringatan bahwa penyimpanan hanya pada satu perangkat memiliki risiko jika perangkat hilang atau rusak.

FR-052: Cadangan harus dilindungi dari akses yang tidak sah. Ekspor data sensitif harus mengikuti izin pemilik.

8. Aturan Bisnis

1. Setiap transaksi memiliki ID unik yang tetap sama selama proses penyimpanan dan sinkronisasi.
2. Nomor struk yang ditampilkan harus unik dalam ruang lingkup usaha yang ditentukan.
3. Transaksi yang selesai tidak boleh dihapus secara diam-diam.
4. Harga pada transaksi lama tidak mengikuti perubahan harga produk saat ini.
5. Produk nonaktif tidak dapat dipakai pada transaksi baru.
6. Transaksi harus tersimpan secara lokal sebelum status sukses ditampilkan.
7. Percobaan sinkronisasi berulang harus idempoten, sehingga satu transaksi hanya tercatat sekali di server.
8. Kegagalan printer atau cloud tidak boleh menggandakan pembayaran maupun transaksi.
9. Setiap perubahan sensitif harus dilakukan oleh pengguna yang memiliki izin.
10. Waktu perangkat perlu diperhatikan untuk laporan; sistem harus menyimpan timestamp dan menangani perubahan waktu perangkat secara wajar.
11. Penghapusan atau pemulihan data harus mengikuti prosedur yang dapat diaudit.
12. Definisi penjualan bruto, diskon, pengembalian dana, dan penjualan bersih harus konsisten di seluruh laporan.

9. Kebutuhan Nonfungsional

9.1 Kinerja

- Tampilan kasir harus responsif pada tablet Android yang ditetapkan sebagai perangkat minimum.
- Perhitungan total transaksi harus berlangsung tanpa jeda yang mengganggu operasional.
- Pencarian produk dan riwayat harus tetap dapat dilakukan saat offline.
- Target waktu respons final ditentukan melalui pengujian pada perangkat sasaran.

9.2 Keandalan

- Transaksi yang telah dikonfirmasi tersimpan tidak boleh hilang hanya karena aplikasi ditutup secara normal atau koneksi internet terputus.
- Antrean sinkronisasi harus bertahan setelah aplikasi dimulai ulang.
- Aplikasi harus menangani printer terputus, database gagal, dan koneksi cloud terputus dengan pesan yang jelas.

9.3 Keamanan

- PIN tidak disimpan dalam bentuk teks biasa.
- Akses data dan fitur mengikuti peran pengguna.
- Komunikasi cloud menggunakan koneksi terenkripsi.
- Otorisasi harus ditegakkan pada server, bukan hanya disembunyikan di antarmuka.
- Data transaksi dan token tidak boleh muncul pada log diagnostik yang tidak aman.
- Operasi berisiko tinggi harus meminta autentikasi atau izin tambahan bila sesuai.

9.4 Privasi

- Aplikasi hanya mengumpulkan data yang diperlukan untuk operasional.
- Pemilik harus mengetahui data yang disinkronkan ke cloud.
- Data pelanggan tidak dikumpulkan kecuali fitur yang membutuhkannya diaktifkan.
- Retensi dan penghapusan data harus mengikuti kebijakan usaha serta kewajiban hukum yang berlaku.

9.5 Kemudahan Penggunaan

- Tombol utama mudah disentuh pada tablet.
- Alur transaksi dibuat sesingkat mungkin.
- Status offline, cloud, printer, dan sinkronisasi terlihat jelas.
- Pesan kesalahan menggunakan Bahasa Indonesia dan menjelaskan langkah pemulihan.

10. Alur Utama Penggunaan

10.1 Penyiapan Awal

1. Pemilik memasang dan membuka D’Fixer POS.
2. Pemilik menyelesaikan penyiapan usaha.
3. Pemilik membuat PIN dan mengatur akses kasir.
4. Pemilik memasukkan produk dan kategori.
5. Pemilik menghubungkan printer Bluetooth bila tersedia.
6. Pemilik melakukan transaksi uji dan mencetak struk contoh.
7. Aplikasi siap digunakan secara offline.

10.2 Transaksi Kasir

1. Kasir membuka aplikasi.
2. Kasir memasukkan PIN.
3. Kasir memilih produk.
4. Kasir memeriksa keranjang dan total.
5. Kasir memasukkan jumlah uang yang diterima.
6. Sistem menghitung kembalian.
7. Kasir mengonfirmasi pembayaran.
8. Sistem menyimpan transaksi secara lokal.
9. Aplikasi menampilkan transaksi berhasil.
10. Kasir mencetak atau mencetak ulang struk bila diperlukan.

10.3 Aktivasi Cloud

1. Pemilik membuka Pengaturan.
2. Pemilik memilih Cloud dan Sinkronisasi.
3. Aplikasi menampilkan penjelasan dan kebutuhan aktivasi.
4. Pemilik melakukan autentikasi dan menyelesaikan konfigurasi cloud.
5. Aplikasi memverifikasi koneksi.
6. Aplikasi menyinkronkan data sesuai kebijakan dan menampilkan statusnya.
7. Jika koneksi terputus, transaksi baru tetap disimpan lokal dan masuk antrean sinkronisasi.

11. Rancangan Data Tingkat Tinggi

Entitas data yang direkomendasikan:

- Business: identitas dan konfigurasi usaha.
- User: identitas pengguna dan peran.
- RegisteredDevice: perangkat yang diizinkan.
- Category: kategori produk.
- Product: nama, kategori, harga, status, dan metadata.
- Transaction: ID unik, nomor struk, waktu, status, total, pembayaran, dan metadata sinkronisasi.
- TransactionItem: produk snapshot, kuantitas, harga satuan, dan subtotal.
- Payment: metode, jumlah dibayar, dan status pembayaran.
- ReceiptSettings: pengaturan struk dan printer.
- SyncQueue: pekerjaan sinkronisasi yang tertunda atau gagal.
- AuditLog: catatan tindakan sensitif.
- BackupMetadata: informasi cadangan dan pemulihan.

Struktur final, relasi, constraint, dan migrasi database harus ditentukan pada spesifikasi teknis. Penyimpanan uang menggunakan tipe numerik yang tepat, bukan floating-point untuk perhitungan finansial.

12. Kriteria Penerimaan MVP

MVP dianggap memenuhi persyaratan apabila:

1. Pemilik dapat menyiapkan usaha dan produk.
2. Kasir dapat login menggunakan PIN lokal pada perangkat yang terdaftar.
3. Kasir dapat menyelesaikan transaksi ketika internet tidak tersedia.
4. Transaksi yang sukses tersimpan secara persisten dan muncul di riwayat.
5. Total pembayaran dan kembalian dihitung dengan benar.
6. Struk dapat dicetak pada printer thermal Bluetooth yang kompatibel.
7. Printer yang gagal terhubung tidak menyebabkan transaksi hilang atau berulang.
8. Laporan dasar sesuai dengan transaksi yang tercatat.
9. Cloud dapat diaktifkan melalui pengaturan oleh pemilik.
10. Sinkronisasi ulang atas transaksi yang sama tidak membuat duplikasi.
11. Aplikasi dapat dilanjutkan setelah koneksi internet terputus dan pulih.
12. Menonaktifkan cloud tidak menghapus data lokal.
13. Hak akses kasir tidak dapat digunakan untuk membuka fungsi khusus pemilik.
14. Pencadangan dan pemulihan diuji sebelum rilis produksi.
15. Pesan penting dan alur transaksi menggunakan Bahasa Indonesia.

13. Risiko dan Mitigasi

Perangkat hilang atau rusak: sediakan pencadangan dan dokumentasikan keterbatasan data lokal.

Duplikasi transaksi: gunakan ID transaksi stabil, constraint unik di server, dan operasi sinkronisasi idempoten.

Konflik data: tetapkan aturan kepemilikan data dan konflik untuk setiap jenis entitas.

Printer tidak kompatibel: uji daftar perangkat printer sasaran dan sediakan pesan pemecahan masalah.

PIN disalahgunakan: terapkan pembatasan percobaan, penyimpanan PIN yang aman, dan prosedur pemulihan.

Kegagalan database lokal: gunakan transaksi database yang atomik, migrasi terkontrol, serta pengujian pemulihan.

Aktivasi cloud salah konfigurasi: lakukan validasi koneksi dan jelaskan status sinkronisasi sebelum menyatakan proses selesai.

14. Metrik Keberhasilan

- Persentase transaksi yang berhasil disimpan secara lokal.
- Tingkat keberhasilan transaksi tanpa koneksi internet.
- Jumlah duplikasi transaksi setelah sinkronisasi.
- Tingkat keberhasilan pencetakan struk.
- Waktu rata-rata penyelesaian transaksi.
- Tingkat keberhasilan pemulihan data dari cadangan.
- Jumlah kegagalan aplikasi pada alur transaksi utama.

Target numerik ditetapkan setelah pengujian prototipe dan perangkat sasaran.

15. Tahapan Pengembangan

Tahap 1 — Fondasi

- Struktur aplikasi dan navigasi.
- Database lokal dan migrasi.
- Autentikasi PIN dan peran.
- Registrasi perangkat.

Tahap 2 — Fitur Kasir

- Produk dan kategori.
- Keranjang.
- Pembayaran tunai.
- Penyimpanan transaksi dan riwayat.

Tahap 3 — Operasional

- Printer Bluetooth.
- Struk.
- Laporan dasar.
- Pengaturan usaha.

Tahap 4 — Keamanan dan Ketahanan

- Pencadangan dan pemulihan.
- Pengujian kegagalan database.
- Pengujian akses dan keamanan.
- Pengujian perangkat Android sasaran.

Tahap 5 — Cloud Opsional

- Konfigurasi dan autentikasi cloud.
- API dan otorisasi server.
- Antrean sinkronisasi.
- Idempotensi dan pencegahan duplikasi.
- Pemantauan status sinkronisasi.

Tahap 6 — Pengujian dan Rilis

- Pengujian unit dan integrasi.
- Pengujian transaksi offline.
- Pengujian printer.
- Pengujian sinkronisasi berulang.
- Uji penerimaan pengguna.
- Persiapan rilis produksi.

16. Hal yang Harus Diputuskan Sebelum Implementasi Final

1. Apakah satu instalasi hanya digunakan untuk satu usaha atau mendukung beberapa usaha?
2. Apakah MVP hanya mendukung pembayaran tunai atau membutuhkan metode lain sejak awal?
3. Apakah stok produk perlu dikurangi otomatis pada versi awal?
4. Apakah pembatalan transaksi membutuhkan PIN pemilik?
5. Apakah laporan pemilik hanya tersedia di tablet atau juga melalui dashboard web?
6. Apakah cloud menggunakan layanan backend terkelola atau server sendiri?
7. Berapa lama riwayat transaksi dan cadangan harus disimpan?
8. Model tablet Android dan printer yang akan dijadikan perangkat uji utama.

Keputusan yang belum ditetapkan harus diperlakukan sebagai asumsi terbuka, bukan dianggap sudah diimplementasikan.

17. Prinsip Brand D’Fixer

Master Brand: D’Fixer
Nama Produk: D’Fixer POS
Edisi Awal: Cafetaria
Tagline Master Brand: “FIX. IMPROVE. CREATE.”
Tagline Produk: “Transaksi Lancar, Bisnis T