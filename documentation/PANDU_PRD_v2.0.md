# PANDU — Product Requirements Document

**Versi:** 2.0  
**Status:** Baseline produk; perluasan alpha multi-organisasi dirinci pada arsitektur multi-industri  
**Pemilik:** Tim PANDU  
**Terkait:** [Blueprint](PANDU_ERP_Master_Blueprint_v2.0.md), [Prototype Design](PANDU_Prototype_Design_v2.0.md), [Smart Contract](PANDU_Smart_Contract_v1.0.md)

## 1. Ringkasan produk

PANDU membantu tim PANDU mencatat pemeriksaan satu batch bahan, menyetujui hasilnya, lalu membuat bukti digital yang dapat diperiksa pembeli atau auditor melalui tautan publik.

**Bagi pengguna:** catat pemeriksaan → minta persetujuan → bagikan bukti → pihak lain memeriksa keasliannya.

Blockchain hanya menyimpan sidik jari digital dari bukti yang disetujui. Data operasional lengkap dan berkas asli tetap berada di server PANDU. PANDU membuktikan bahwa catatan tidak berubah sejak di-anchor; PANDU tidak membuktikan sendiri bahwa barang fisik atau pengukuran awal benar.

## 2. Masalah dan nilai

Catatan PANDU tersebar di PDF, spreadsheet, email, dan sistem internal. Pembeli sering tidak dapat memastikan apakah dokumen yang diterima masih sama dengan yang disetujui pemasok.

PANDU memberi tim satu alur pencatatan dan memberi pihak luar pemeriksaan integritas yang independen. Pengguna operasional tidak perlu membuat wallet, membeli aset kripto, atau memahami transaksi blockchain.

## 3. Pengguna

| Pengguna | Yang ingin dilakukan | Hasil di PANDU |
|---|---|---|
| Petugas QC | Mencatat pemeriksaan dan bukti | Inspeksi tersimpan dan terkirim untuk ditinjau |
| Manajer QA | Memeriksa dan menyetujui hasil | Persetujuan tercatat; proof dapat dibuat |
| Pembeli / auditor | Memeriksa proof yang dibagikan | Status dan ringkasan proof tampil tanpa akun |
| Admin organisasi | Mengatur anggota dan akses | Pengguna bekerja pada organisasi yang benar |
| Pemilik organisasi | Membuat workspace dan mengundang tim | Organisasi, industri, dan role terpisah dari tenant lain |
| Relayer sistem | Mengirim dan memeriksa transaksi | Status anchor mengikuti hasil jaringan nyata |

## 4. Tujuan, bukan tujuan

### Tujuan MVP

1. Pengguna dapat merekam satu batch dan satu hasil inspeksi.
2. Petugas QC tidak dapat menyetujui inspeksinya sendiri.
3. QA yang berwenang dapat menyetujui atau menolak inspeksi.
4. Proof yang disetujui mempunyai komitmen SHA-256 yang deterministik.
5. Backend dapat meng-anchor proof ke Arbitrum Sepolia melalui relayer.
6. Pihak luar dapat memeriksa proof tanpa login dan tanpa wallet.
7. Perubahan pada proof menghasilkan status yang jujur: cocok, tidak cocok, atau dicabut.
8. Berkas dan data sensitif tidak ditulis ke blockchain.
9. Beberapa organisasi dapat memakai satu aplikasi dengan isolasi data per tenant.
10. Login utama memakai akun Google/Gmail; wallet MetaMask ditautkan sesudah login dan tidak memberi role secara otomatis.

### Bukan tujuan MVP

- Menjual token atau bagian kepemilikan komoditas.
- Marketplace, pinjaman, escrow, pembayaran, DAO, atau NFT.
- Menyimpan PDF, data pribadi, harga, atau catatan internal di blockchain.
- Mengotomatiskan pengukuran fisik atau memvalidasi kualitas barang secara mandiri.
- Membangun seluruh fungsi ERP atau integrasi ERP pelanggan.
- Menggunakan mainnet atau menetapkan model harga produksi.

## 5. Ruang lingkup MVP

### P0 — harus berfungsi

- Login Google/Gmail melalui Supabase Auth; email OTP sebagai fallback.
- Pembuatan organisasi, undangan anggota, pemilih organisasi aktif, dan membership multi-organisasi.
- Role tenant `owner`, `admin`, `qc`, `qa`, dan `auditor`; API memverifikasi token, membership, dan role.
- PostgreSQL dengan Row Level Security pada tabel tenant; file di private object storage.
- Data contoh supplier, material, batch, inspeksi, dan bukti.
- Form inspeksi dengan nilai aktual dan rentang spesifikasi.
- Perhitungan PASS/FAIL di server, bukan hanya di browser.
- Unggah bukti; hitung SHA-256 dari byte file; simpan berkas off-chain.
- Alur QC submit → QA approve/reject.
- Pembuatan proof kanonis dengan `canonicalizationVersion = 1`.
- Anchor idempoten melalui backend relayer dan kontrak.
- Halaman publik verifikasi dengan status `VERIFIED`, `MISMATCH`, `REVOKED`, `PENDING`, atau `UNAVAILABLE`.
- Audit event untuk aksi penting.
- Status transaksi hanya `CONFIRMED` setelah receipt sukses dan data kontrak cocok.
- Opsi hubungkan MetaMask dari pengaturan akun dengan SIWE challenge; tidak ada transaksi/gas dan tidak mengubah role.

### P1 — setelah demo inti

- Pengelolaan master supplier/material yang lebih lengkap.
- Versi bukti, pengiriman/receiving, batch dari proses penerimaan.
- QR code, notifikasi, dan ekspor laporan.
- Rekonsiliasi anchor dan monitoring operasional yang lebih lengkap.

### P2 — perlu riset produk dan legal

- Integrasi ERP eksternal, pemasok eksternal, multi-organisasi, dan kontrol akses berbagi yang lebih rinci.
- Pembiayaan perdagangan atau pelepasan pembayaran berdasarkan status PANDU.
- Tokenisasi atau representasi kepemilikan aset, hanya setelah model hukum dan kustodi jelas.

## 6. Alur utama pengguna

1. Pengguna masuk dengan Google/Gmail, menerima undangan organisasi, lalu memilih organisasi aktif. Menghubungkan MetaMask adalah opsional.
2. QC memilih atau membuat batch.
3. QC memasukkan jenis pemeriksaan, spesifikasi versi organisasi, nilai aktual, dan catatan.
4. Sistem menghitung hasil. Contoh: tebal 10,0 mm, rentang 9,5–10,5 mm → **Lulus**.
5. QC mengunggah sertifikat/foto; aplikasi menghitung sidik jari file dan menyimpan file secara privat.
6. QC mengirim pemeriksaan ke QA.
7. QA memeriksa hasil dan bukti, lalu menyetujui atau menolak; QC tidak dapat menyetujui pemeriksaannya sendiri.
8. Setelah disetujui, QA membuat proof. Backend membentuk representasi kanonis dan menghitung komitmen SHA-256.
9. Relayer mengirim anchor; setelah receipt dan data on-chain cocok, PANDU menampilkan **Terekam di blockchain** dan tautan verifikasi.
10. Pembeli membuka tautan tanpa login. PANDU membandingkan snapshot allowlist dengan komitmen on-chain.

## 7. Persyaratan fungsional dan kriteria penerimaan

| ID | Persyaratan | Kriteria penerimaan |
|---|---|---|
| FR-01 | Batch memiliki referensi publik yang tidak memuat data privat | Pengguna dapat memilih batch demo dan membuka detailnya |
| FR-02 | Inspeksi menyimpan spesifikasi, angka, unit, hasil, pembuat, dan waktu | Nilai di luar batas tidak dapat ditandai lulus oleh input browser |
| FR-03 | QC mengirim inspeksi untuk review | Status berpindah dari `DRAFT` ke `SUBMITTED` dan tercatat di audit |
| FR-04 | QA menyetujui/menolak secara terpisah | Aksi QC yang menyetujui inspeksi sendiri ditolak server |
| FR-05 | Bukti disimpan privat dan mempunyai SHA-256 file | Hash dihitung server dari byte file; file tidak ditaruh di chain |
| FR-06 | QA membuat proof setelah approval | Proof memuat snapshot yang disetujui dan versi kanonisasi |
| FR-07 | Permintaan anchor aman diulang | Request key sama menghasilkan satu anchor; proof tidak dapat di-anchor dua kali |
| FR-08 | Status anchor berasal dari rekonsiliasi | Hash transaksi atau status sukses tidak dibuat-buat; kegagalan jelas terlihat |
| FR-09 | Publik dapat memeriksa proof tanpa akun | Halaman menampilkan hasil dan menjelaskan artinya dengan bahasa biasa |
| FR-10 | Proof dapat dicabut tanpa menghapus riwayat | Status revoked dan anchor historis tetap dapat dibaca |
| FR-11 | Data tenant dan fungsi dibatasi peran | Permintaan lintas organisasi ditolak; setiap mutasi mencatat aktor |
| FR-12 | Pengguna masuk memakai Google/Gmail | Token sesi tervalidasi; pengguna tanpa membership tidak dapat membuka data organisasi |
| FR-13 | Pengguna dapat masuk ke beberapa organisasi | Pemilih organisasi hanya menampilkan membership aktif pengguna |
| FR-14 | Pengguna dapat menautkan wallet setelah login | Server memverifikasi nonce SIWE sekali pakai; signature gagal/kedaluwarsa ditolak; wallet tidak memberi role |
| FR-15 | Isolasi tenant berlaku pada database dan berkas | Uji dua tenant membuktikan API/RLS/storage tenant A tidak dapat membaca atau mengubah data tenant B |

### Bahasa status untuk pengguna

| Status teknis | Label antarmuka | Makna |
|---|---|---|
| `NOT_ANCHORED` | Belum direkam | Proof belum dikirim ke blockchain |
| `PENDING` | Sedang direkam | Transaksi sedang menunggu konfirmasi |
| `CONFIRMED` | Terekam di blockchain | Transaksi sukses dan data kontrak sudah cocok |
| `FAILED` | Gagal direkam | Transaksi gagal; proof tetap tersimpan di PANDU |
| `VERIFIED` | Bukti cocok | Komitmen proof cocok dengan komitmen on-chain dan belum dicabut |
| `MISMATCH` | Bukti berubah | Proof yang diperiksa berbeda dari proof yang di-anchor |
| `REVOKED` | Bukti dicabut | Proof pernah direkam tetapi kemudian dicabut |
| `UNAVAILABLE` | Belum dapat diperiksa | Jaringan atau layanan verifikasi belum dapat memberi hasil |

## 8. Batas kepercayaan dan privasi

- Hash hanya membuktikan kesamaan byte/representasi, bukan kebenaran isi atau keadaan fisik.
- Proof publik hanya memuat kolom yang secara eksplisit disetujui untuk dibagikan.
- PDF, foto, PII, harga, purchase order, dan catatan internal tetap privat.
- Verifikasi proof publik tidak memerlukan file privat. Hash file opsional dapat diperiksa jika pemilik membagikan file itu secara sengaja.
- Menyembunyikan URL file bukan kontrol akses. Endpoint file harus melakukan otorisasi.
- Jika penyedia RPC tidak tersedia, tampilkan “Belum dapat diperiksa”; jangan menyimpulkan verified.
- Identitas login adalah Google/Gmail atau SSO; MetaMask hanya membuktikan kontrol atas wallet yang ditautkan.
- Alamat wallet tidak membuktikan nama/jabatan/legalitas badan usaha. Role QC/QA diberikan oleh admin organisasi.
- Halaman publik memakai token acak dan snapshot allowlist; jangan mengekspos endpoint tabel tenant atau file privat.

## 8.1 Keputusan platform untuk multi-organisasi

- Auth: Supabase Auth, Google OAuth/Gmail sebagai metode utama, email OTP fallback, SSO perusahaan sesuai kebutuhan.
- Database: Supabase PostgreSQL dengan `organization_id` dan RLS pada semua tabel tenant.
- File: Supabase Storage private bucket; server memeriksa membership sebelum mengeluarkan URL signed sementara dan menghitung SHA-256 dari byte berkas.
- API: Express memvalidasi JWT dan role organisasi untuk semua mutasi. `service_role` hanya berada di backend/worker dan tidak menjadi jalan pintas untuk permintaan browser.
- Wallet: SIWE untuk menghubungkan MetaMask setelah login. Anchor/revoke tetap memakai relayer server.
- Implementasi lokal sekarang masih single-tenant JSON demo; keputusan target dan urutan migrasi ada di [Arsitektur Multi-Industri v1.0](PANDU_Multi_Industry_Architecture_v1.0.md).

## 9. Pengukuran keberhasilan

Untuk MVP ukur: keberhasilan menyelesaikan alur demo; waktu dari inspeksi dikirim sampai keputusan QA; keberhasilan upload; tingkat anchor sukses; waktu halaman publik menghasilkan status; dan kemampuan pengguna awam menjelaskan arti status. Jangan mengklaim penghematan biaya atau product-market fit sebelum diuji dengan perusahaan.

## 10. Dataset demo

| Bidang | Nilai |
|---|---|
| Organisasi | PT PANDU Nusantara |
| Supplier | PT Baja Nusantara |
| Material | Pelat baja SS400 |
| Batch | ST-2026-001 |
| Pemeriksaan | Ketebalan: 10,0 mm |
| Batas spesifikasi | 9,5–10,5 mm |
| Bukti | Laporan inspeksi, sertifikat material, 2 foto |
| Proof | PANDU-QP-2026-000001 |
| Jaringan demo | Arbitrum Sepolia |

## 11. Demo penerimaan

Demo dianggap siap ketika reviewer dapat melihat batch, mengirim inspeksi, menyetujui sebagai QA, membuat proof, melihat transaksi nyata pada explorer, membuka verifikasi publik, lalu memicu mismatch/revoke demo dan memahami hasilnya. Data simulasi harus diberi label **DEMO**; transaksi mock tidak boleh tampil seolah transaksi nyata.
