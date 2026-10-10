# PANDU — Threat Model (Baseline Fase 0)

**Cakupan:** arsitektur aplikasi saat ini yang terbaca di repo. Ini baseline, bukan klaim bahwa seluruh kontrol sudah berjalan di deployment. Status Supabase live belum diketahui; nilai `.env` sengaja tidak dibaca.

## Aset yang perlu dilindungi

1. Data bisnis: supplier, material, kode batch, spesifikasi, nilai pengukuran, hasil QA, notes, identitas pengguna, dan aktivitas organisasi.
2. Bukti file: isi file, nama asli, metadata, CID, hash/HMAC, dan kunci DEK/KEK.
3. Integritas klaim: proof ID, evidence hash, batch reference, snapshot yang ditandatangani, tanda tangan issuer, status revoke, dan jejak transaksi.
4. Akses/availability: keanggotaan organisasi, token/sesi OAuth, service key Supabase, relayer key, PINATA JWT, public-token secret, serta akses ke RPC/IPFS.
5. Kepercayaan proses: role admin/issuer/relayer dan keputusan apakah klaim benar-benar berasal dari alat ukur atau laboratorium tepercaya.

## Aktor dan batas kepercayaan

| Aktor | Kapabilitas yang diasumsikan | Batas kepercayaan |
|---|---|---|
| Admin/operator PANDU | Mengelola backend, service key, konfigurasi, dan proses operasional. | Infrastruktur aplikasi memiliki kemampuan membaca/mengubah row Postgres; saat ini tidak ada enkripsi kolom menyeluruh yang menghalangi operator. |
| Penyerang database | Dapat membaca, mengubah, menghapus, atau menahan snapshot dan file metadata/backup. | RLS mengurangi akses lintas organisasi untuk client authenticated, tetapi tidak melindungi dump DB atau service-role backend. |
| Relayer jahat/terkompromi | Mengendalikan akun transaksi yang memiliki `RELAYER_ROLE`, dapat mengirim atau menahan transaksi. | Tanpa signature issuer yang valid, relayer v2 tidak dapat mengubah attester/hash anchor; ia tetap dapat menyensor, menunda, atau mengirim transaksi valid yang sudah ditandatangani. |
| Issuer jahat/terkompromi | Dapat menyetujui hash proof dengan EIP-712 jika memiliki `ISSUER_ROLE`. | Kontrak membuktikan otorisasi dan integritas komitmen, bukan kebenaran fisik data yang dimasukkan. |
| Verifikator | Mengakses jalur verifikasi publik dan file yang dibagikan; dapat menyimpan salinan hasil dekripsi. | Data yang dibuka ke verifikator tidak dapat ditarik kembali. Saat ini endpoint membuka seluruh `public_snapshot`. |
| Pesaing/pengamat publik | Dapat mengetahui kode batch, URL proof, CID, alamat kontrak, dan metadata publik. | Kode batch dan endpoint resolve tidak membutuhkan login; snapshot berisi detail operasional yang bisa dipakai untuk inferensi bisnis. |
| Anggota organisasi berbahaya / skrip same-origin | Memiliki sesi organisasi atau kemampuan menjalankan JavaScript same-origin/XSS. | RLS/role mengatur akses data; JavaScript origin dapat membaca storage browser dan memanggil API atas nama sesi yang aktif. |

## Ancaman, kontrol yang terlihat, dan risiko tersisa

| Ancaman | Kontrol yang terlihat di repo | Risiko tersisa pada baseline |
|---|---|---|
| Dump database membocorkan data usaha | Supabase RLS dan role organisasi ada pada migration foundation. | Field bisnis masih plaintext; snapshot proof menyimpan nilai bisnis dan dikembalikan route publik. PANDU/service key dapat membaca semua tabel. Risiko **tinggi**. |
| Penyerang mengubah bukti di database | API verifikasi menghitung ulang commitment dan membandingkannya dengan `evidenceHash`/batch ref on-chain (`backend/src/server.js:766–790`). | Perubahan sesudah anchor dapat ditandai mismatch, tetapi data dapat dibaca/dihapus/ditahan. Sebelum tanda tangan/anchor, database/backend dapat mengubah isi proof. Hash tidak memberi availability atau kerahasiaan. |
| File bukti terbaca dari penyimpanan | UI mengenkripsi file AES-GCM sebelum upload dan menyimpan nama file terenkripsi (`frontend/src/Workspace.tsx:655–687`; `frontend/src/crypto.ts`). | Endpoint upload menerima `application/octet-stream` dari browser namun Multer menolak MIME itu (`backend/src/server.js:123–132`); constraint SQL juga menolak MIME itu. Jalur file belum berfungsi konsisten. Fallback demo menerima file lain, menulis lokal/Pinata, dan tidak punya auth sendiri. |
| Kunci bocor lewat browser | Enkripsi/dekripsi dilakukan dengan Web Crypto, dan file DEK dibungkus untuk pemilik/recovery. | Recovery passphrase berada di `sessionStorage`; private key verifikator berada di `localStorage`. Same-origin script/XSS dapat membaca secret/session dan mengakses kunci saat dipakai. Wallet signature dipakai menjadi bahan key derivation; domain tidak menggantikan isolasi organisasi/key-id. |
| Relayer membuat proof palsu | Kontrak v2 memisahkan `RELAYER_ROLE` dan `ISSUER_ROLE`, memeriksa EIP-712 lewat `SignatureChecker`, mem-pin domain ke chain/contract. | Relayer dapat menahan/censor tx dan berisiko saat key backend dicuri; tanda tangan valid masih dapat mengesahkan data input yang palsu. Nonce/retry queue operasional belum durable/idempotent. |
| Issuer menyetujui data palsu atau salah | Signature on-chain mengikat issuer, proof ID, batch ref, evidence hash, deadline; issuer perlu role. | Tidak ada attestor alat/lab atau ZK verifier yang memeriksa sumber/nilai. Kontrak tidak tahu apakah bukti ukur mencerminkan kondisi nyata. Risiko **tinggi** untuk klaim “otomatis benar”. |
| Revoke atau pause disalahgunakan | Revoke dibatasi ke attester asli/admin; anchor memerlukan relayer; pause memakai role PAUSER (`PANDUQualityRegistry.sol:82–101, 124–175`). | Admin/issuer/pauser tetap titik otoritas dan bisa kehilangan/menyalahgunakan key. Pemantauan dan prosedur insiden belum setara kebutuhan produksi. |
| Enumerasi atau scraping bukti publik | Token HMAC dibentuk di backend; `/api/public/proofs` memvalidasi bentuk token. | `/api/public/resolve` mengubah kode batch menjadi token tanpa autentikasi dan endpoint proof menerima public ID; tidak tampak rate limit publik. Snapshot lengkap dibuka setelah status anchor. |
| Route demo dipanggil tanpa auth | Server saat ini bind ke `127.0.0.1`; production routes memakai bearer Supabase. | Route demo mutasi tidak memakai auth. Reverse proxy yang meneruskan semua path atau penggunaan lokal bersama dapat membuatnya terjangkau. CORS tanpa `Origin` bukan perlindungan akses. |
| Input/exception membocorkan detail internal | Zod dipakai untuk sebagian body; JSON dibatasi 1 MB, file 10 MB. | Beberapa route legacy/demo dan parameter belum memakai schema lengkap; error handler mengirim `error.message`; tidak ditemukan Helmet/CSP. Rate limit tidak tampak pada semua endpoint publik. |
| Service key / private key terekspos | `.env` di-ignore Git; frontend memakai Supabase publishable key. Backend hanya membaca key dari environment. | Service key melewati RLS; relayer key, PINATA JWT, public token secret memiliki blast radius tinggi. Setup script menulis private key ke `.env` lokal; skrip migrasi dapat memakai service key untuk SQL. Tidak ada KMS/secret manager wajib. |
| Migrasi atau cleanup menghapus/mengubah data | Migration files tersimpan untuk ditinjau. | Privacy migration menghapus bucket dan menjatuhkan kolom. Beberapa runner SQL tidak dry-run/backup/confirmation; cleanup storage tidak memiliki rollback terverifikasi. Tidak dijalankan saat Fase 0; status live belum diketahui. |
| Data/layanan unavailable | Proof commitment dicatat di chain; file memakai CID/IPFS/Pinata. | Blockchain tidak menyimpan file; ketersediaan bergantung pinning, Supabase, RPC, dan backup. Tidak ada bukti replikasi/retensi atau runbook pemulihan yang diaudit. |

## Batas jaminan kriptografi saat ini

- EIP-712 pada v2 memberi bukti bahwa alamat issuer menyetujui komitmen tertentu; ia tidak membuktikan data benar atau berasal dari sensor/lab.
- Hash on-chain membuat perubahan snapshot yang sudah di-anchor dapat dideteksi ketika pembanding aslinya tersedia. Hash bersifat publik dan tidak menyembunyikan snapshot, CID, ukuran, pola aktivitas, atau metadata.
- AES-GCM file hanya melindungi bytes yang benar-benar dienkripsi di browser dan hanya jika kunci tetap di luar server. Saat ini tidak semua field bisnis dienkripsi, dan integrasi MIME upload tidak cocok.
- NFT bukan solusi privasi: metadata, URI, pemilik, transfer, dan waktu transaksi dapat menjadi data publik. Belum ada kontrak NFT dalam scope baseline.
- Tidak ada ZK proof atau selective disclosure yang terimplementasi; jangan menyebut klaim standar sebagai diverifikasi otomatis oleh kriptografi.

## Prioritas mitigasi

1. Batasi penggunaan pada data uji sampai enkripsi kolom, snapshot non-sensitif, pembagian data selektif, dan jalur file konsisten.
2. Amankan endpoint publik/demo, validasi schema di seluruh route, batasi respons error, tambahkan header keamanan, readiness dan rate limit global yang atomik.
3. Ganti/isolasi skrip mutasi database dengan alur dry-run, backup yang diverifikasi, konfirmasi eksplisit, dan rollback yang diuji; migrasi utama tetap manual dan terpisah.
4. Lakukan Fase 2 sebelum memindahkan data bisnis lama; jangan menganggap RLS sebagai perlindungan dari database administrator/operator.
5. Tambahkan sumber attestation alat/lab dan ZK setelah riset resmi dan review; audit independen diperlukan sebelum data nyata.

## Kontrol dan risiko setelah Fase 1

- Public proof API sekarang memproyeksikan metadata minimum dan tidak mengirim `public_snapshot`; halaman publik membaca `getProof`, `isValid`, dan `verify()` dari RPC browser. Ini mengurangi kebocoran API, tetapi data bisnis tetap plaintext di Postgres dan tetap dapat dibaca backend dengan service key sampai Fase 2.
- Upload `.enc` hanya menerima nama envelope, memperlakukan bytes sebagai opaque, mengabaikan MIME klien, dan membatasi 10 MiB. File migrasi constraint MIME tersedia tetapi belum dijalankan. Sampai migrasi yang disetujui pemilik diterapkan, constraint live mungkin masih menolak `application/octet-stream`.
- Recovery phrase dan kunci verifier raw tidak disimpan ke Web Storage. Kunci masih berada di memori selama sesi dan XSS same-origin tetap dapat menyerang aplikasi ketika pengguna memakai kunci.
- Route demo mati default, hanya aktif eksplisit di non-production, dan boot menolak `DEMO_ROUTES=true` saat production. API masih bind loopback; reverse proxy tetap harus mengekspos hanya route yang dibutuhkan.
- Helmet/CSP, allowlist CORS, request ID, structured route logs, error handler generik, Zod boot config, `/healthz`, dan `/readyz` sudah ditambahkan. Validasi semua route belum menyeluruh; jalur batch resolve tetap publik dan belum memiliki rate limit/anti-enumeration.
- Anchor/revoke memakai queue dengan batas gas, retry, idempotency journal, lock nonce Redis, timeout/replacement, dan low-balance warning. Migrasi `relayer_jobs` belum dijalankan; job yang status kirimnya ambigu sengaja berhenti dan perlu rekonsiliasi operator. Relayer key masih environment secret, belum KMS.
- Gitleaks full-history scan pada kedua repo memberi nol temuan setelah fingerprint fixture deterministik di-ignore. Ini tidak menilai apakah secret lokal yang di-ignore masih aktif atau dibagikan di luar Git; pemilik perlu memeriksa file lokal/riwayat distribusi dan merotasi kredensial yang pernah terekspos.
- CI terpisah untuk root dan repo kontrak tersedia. Slither masih melaporkan tujuh detector result yang diklasifikasikan di `BASELINE_REPORT.md`; pipeline hanya memblokir temuan high impact. CI belum dijalankan pada GitHub dari branch ini.

Kontrol fase ini tidak mengubah trust boundary utama: admin/backend dapat membaca field bisnis lama, issuer tetap dapat menandatangani data salah, relayer dapat menyensor transaksi, dan bukti kriptografis tidak membuktikan kondisi fisik tanpa attestor alat/lab tepercaya.
