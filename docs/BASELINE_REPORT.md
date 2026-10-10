# PANDU Fase 0 — Audit dan Baseline

**Tanggal pemeriksaan:** 2026-10-10

**Status:** audit statis dan baseline lokal Fase 0 selesai. Bagian baseline di atas adalah hasil historis; status penerapan Fase 1 ada pada bagian akhir.

## Keputusan

PANDU belum memenuhi sasaran trust-minimized untuk data bisnis rahasia. Data nama supplier/material, batch, spesifikasi, pengukuran, catatan, dan snapshot proof disimpan sebagai plaintext di Postgres; API publik dapat mengembalikan snapshot itu. Enkripsi file di klien sudah ada, tetapi jalur unggah saat ini tidak cocok dengan allowlist MIME API dan constraint database, sehingga perlu diperbaiki sebelum dianggap berfungsi. Jangan masukkan data rahasia nyata sebelum jalur penyimpanan dan pengungkapan selektif diperbaiki dan diuji.

Kontrak v2 mempunyai pemeriksaan tanda tangan EIP-712 penerbit dan peran relayer terpisah pada jalur anchor. Ini memberi integritas/otorisasi anchor, tetapi tidak membuktikan kebenaran pengukuran fisik. Fase 0 tidak mengubah kontrak, melakukan deploy, mengirim transaksi, atau menghubungi proyek Supabase utama. Status migrasi dan data live Supabase tidak diketahui dari repo.

## Peta repo

| Bagian | Lokasi dan tanggung jawab |
|---|---|
| API | [`backend/src/server.js`](../backend/src/server.js#L1) memuat konfigurasi, autentikasi, route, akses Supabase, EIP-712, relayer, upload, demo lokal, dan verifikasi dalam satu file (~1.041 baris). Utilitas produksi ada di `backend/src/env-guard.js` dan `backend/src/rate-limiter.js`. |
| Frontend | `frontend/src/` berisi React/Vite, Workspace, auth Supabase, kriptografi browser, dan halaman verifikasi publik; tes unit di `frontend/test/`, Playwright di `frontend/e2e/`. |
| Kontrak | [`smart-contract/src/PANDUQualityRegistry.sol`](../smart-contract/src/PANDUQualityRegistry.sol#L21), tes Foundry, `Deploy.s.sol`, `GrantRoles.s.sol`, `CheckRoles.ps1`, `deployment.json`, dan docs verifikasi di repo bersarang `smart-contract/`. |
| Database | Tujuh file SQL di `supabase/migrations/`. Foundation mendefinisikan `profiles`, `organizations`, `organization_members`, `user_wallets`, `wallet_link_challenges`, `quality_profiles`, `suppliers`, `materials`, `batches`, `inspections`, `evidence_files`, `quality_proofs`, dan `audit_events`. Migrasi privacy menambah `user_google_accounts`; saya tidak menemukan tabel `key_envelopes`. Definisi ada di [`202610090001_multi_tenant_foundation.sql`](../supabase/migrations/202610090001_multi_tenant_foundation.sql#L5) dan [`202610100001_privacy_migration.sql`](../supabase/migrations/202610100001_privacy_migration.sql#L16). |
| Skrip operasional | `backend/scripts/`: `setup-testnet.mjs`, `deploy-testnet.mjs`, `deploy-arbitrum-one.mjs`, `apply-migration.mjs`, `push-fix-migration.mjs`, `run-sql-direct.mjs`, `migrate-cleanup-storage.mjs`. `smart-contract/script/`: `Deploy.s.sol`, `GrantRoles.s.sol`, `CheckRoles.ps1`. Skrip database tidak dijalankan dalam audit ini. |
| Environment | `.env` diabaikan oleh root `.gitignore` dan `smart-contract/.gitignore`. File lokal `backend/.env` dan `smart-contract/.env` ada; nilainya tidak dibaca atau dicetak. `frontend/.env` tidak ada. Nama konfigurasi yang dipakai mencakup `SUPABASE_URL`, `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, `RELAYER_PRIVATE_KEY`, `PINATA_JWT`, `PUBLIC_TOKEN_SECRET`, `PANDU_CHAIN`, `PANDU_REGISTRY_ADDRESS`, `PANDU_LEGACY_REGISTRY_ADDRESS`, `REDIS_URL`, `TRUST_PROXY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, dan `VITE_API_URL`. |
| ZK/Rust | Tidak ditemukan `Cargo.toml` atau workspace Rust; `cargo`/`cargo-audit` tidak tersedia. Belum ada guest/host RISC Zero dalam repo. |

### Versi dan dependensi

- Toolchain yang diuji: Node `v24.19.0`, npm `11.17.0`, Foundry `forge 1.8.3`, Slither `0.11.6`; compiler Foundry `solc 0.8.28`.
- Foundry: optimizer aktif 200 runs, `via_ir=false`, EVM `cancun` di [`foundry.toml`](../smart-contract/foundry.toml). `foundry.lock` mematok OpenZeppelin Contracts `v5.1.0` (`69c8def5…`).
- Backend aktual (`npm ls --depth=0`): Supabase JS `2.117.3`, Express `5.2.1`, ethers `6.17.0`, ioredis `6.0.0`, multer `2.4.0`, Zod `4.6.5`, dotenv `16.6.1`.
- Frontend aktual: React/React DOM `19.3.0`, Supabase JS `2.117.3`, Vite `6.4.4`, TypeScript `5.8.3`, Vitest `5.0.3`, Playwright `1.64.0`, ethers `6.17.0`.
- `npm audit` tidak menemukan kerentanan pada kedua lockfile (backend 108 dependency, frontend 205). `npm outdated` menunjukkan update tersedia, sebagian lintas major: Express `5.2.1 → 5.3.0`; dotenv `16.6.1 → 18.0.7`; plugin React `4.7.0 → 6.1.2`; lucide-react `0.468.0 → 1.55.0`; TypeScript `5.8.3 → 7.0.2`; Vite `6.4.4 → 8.3.4`; Motion `14.0.0 → 14.1.0`. Ini sinyal evaluasi kompatibilitas, bukan temuan `npm audit`.

### Peta route backend

- Health: `GET /api/health`.
- Memerlukan bearer Supabase: wallet challenge/verify; daftar/invite/ubah/hapus anggota organisasi; buat proof; share/sign/revoke payload; anchor dan revoke. Route perubahan proof juga memeriksa role organisasi dan validasi Zod untuk sebagian payload (`backend/src/server.js:317–727`).
- Publik: `GET /api/public/resolve`, `GET /api/public/proofs/:token`; route verifikasi demo lokal `GET /api/verify` dan `GET /api/verify/:proofId`.
- Demo tanpa middleware autentikasi: `/api/demo`, `/api/reset`, `/api/demo/tamper`, `/api/inspection/submit`, `/api/evidence`, `/api/evidence/:id`, `/api/qa/approve`, `/api/proof`, `/api/anchor`, `/api/revoke` (`backend/src/server.js:794–1034`). Server bind loopback saat ini (`:1041`).

## Baseline yang dijalankan

| Perintah | Hasil |
|---|---|
| `forge build` | Lulus; solc `0.8.28`. Forge lint mengeluarkan peringatan penggunaan `block.timestamp`, event setelah external call, dan `vm.warp` di tes. |
| `forge test` | **29 lulus, 0 gagal, 0 skip**; termasuk fuzz 256 runs per fuzz test. |
| `forge coverage` | Tes 29/29 lulus. Kode `PANDUQualityRegistry.sol`: **100% lines, statements, branches, functions**. Total laporan Foundry: lines 51.89%, statements 54.96%, branches 68.42%, functions 86.67%; total turun karena skrip deploy/grant masing-masing 0% teruji. |
| `slither .` | Exit code 1; 55 hasil termasuk OpenZeppelin dependency. Dengan `--exclude-dependencies`: 7 hasil pada source proyek, dari detector `incorrect-equality`, `timestamp`, dan `pragma`. Hasil equality pada sentinel/hash dan timestamp deadline perlu triase; tidak ada kontrak baru yang diaudit. |
| `backend: npm test` | **13 lulus, 0 gagal**. Tes rate-limit sengaja mencetak log simulasi Redis gagal; tidak ada secret yang dicetak. |
| `backend: npm run build` | Lulus (`node -c src/server.js`). |
| `backend: npm audit` | 0 info/low/moderate/high/critical. |
| `frontend: npm test` | **45 lulus, 0 gagal**, 7 file tes. |
| `frontend: npm run build` | Lulus (`tsc -b && vite build`), Vite `6.4.4`. |
| `frontend: npm audit` | 0 info/low/moderate/high/critical. |
| `cargo audit` | Tidak dijalankan: Cargo dan manifest Rust tidak ada. |

## Temuan alur dan prioritas

### P0 — Data bisnis tidak dienkripsi end-to-end

1. Schema memuat kolom plaintext seperti `suppliers.name`, `materials.name/attributes`, `batches.batch_code/attributes`, `inspections.measurements/specification_snapshot/result_summary/notes`, `quality_profiles.rules`, dan `quality_proofs.public_snapshot`; lihat definisi tabel foundation. Workspace membaca dan menulis tabel-tabel tersebut langsung melalui Supabase (`frontend/src/Workspace.tsx:437–444, 521–562`). Tidak ada envelope enkripsi untuk kolom bisnis dan belum ada tabel envelope kunci.
2. Endpoint pembuatan proof merakit snapshot berisi nama material/supplier, batch, hasil/check inspeksi, CID/HMAC/salt file, salt snapshot, dan waktu QA, lalu menyimpan seluruhnya ke `quality_proofs.public_snapshot` (`backend/src/server.js:516–533`). Endpoint publik mengembalikan objek snapshot tersebut (`backend/src/server.js:750–790`). `/api/public/resolve` juga menerima kode batch tanpa login dan memberi token proof (`backend/src/server.js:729–748`); ini membuat kontrol akses bukan batas privasi untuk data dalam snapshot.
3. Database service key dipakai backend (`backend/src/server.js:35`), sehingga RLS untuk pemakai terautentikasi tidak melindungi data dari proses/server PANDU yang memegang service key. Hash on-chain dapat mendeteksi perubahan snapshot sesudah anchor bila dibandingkan dengan chain, tetapi tidak mencegah pembacaan, penghapusan/penahanan data, atau manipulasi sebelum penerbit menandatangani.

### P1 — Jalur unggah ciphertext tidak konsisten

Workspace mengenkripsi file di browser dan mengirim Blob ber-MIME `application/octet-stream` ke `/api/evidence` (`frontend/src/Workspace.tsx:655–680`). Middleware Multer hanya mengizinkan PDF/JPEG/PNG/WebP (`backend/src/server.js:123–132`), sehingga request dari jalur ini ditolak. Bahkan bila allowlist diperbaiki, Workspace menyimpan `mime_type='application/octet-stream'` (`frontend/src/Workspace.tsx:681–690`), sementara foundation SQL membatasi MIME ke empat tipe plaintext lama (`supabase/migrations/202610090001_multi_tenant_foundation.sql:130–143`); migrasi privacy tidak mengganti constraint itu. Baseline test tidak menguji integrasi upload ini.

### P1 — Kunci browser dan pembagian file

- Enkripsi AES-GCM file dan recovery PBKDF2 600.000 iterasi ada di `frontend/src/crypto.ts`; tetapi fallback passphrase memakai salt tetap (`:205–226`), sedangkan variasi recovery lain mempunyai parameter/salt sendiri. Ini perlu disatukan dan diuji dengan spesifikasi envelope/AAD Fase 2.
- `Workspace.tsx:642–650` menyimpan recovery passphrase pada `sessionStorage`. Kunci privat verifikator disimpan permanen pada `localStorage` dan dibaca kembali (`frontend/src/landing/Verify.tsx:228, 403–406`). Keduanya dapat dibaca skrip same-origin/XSS.
- `deriveKeyFromWallet` memakai dua `personal_sign` untuk memperoleh bahan HKDF dengan salt konstan (`frontend/src/crypto.ts:119–165`). Selain beban UX, semua aplikasi pada domain yang sama berpotensi terkait pada derivasi kunci yang sama; pemisahan organisasi/versi/key-id belum terlihat di envelope file.

### P1 — Route, validasi, error, dan operasional

- Route produksi utama memakai bearer Supabase dan pemeriksaan role organisasi (`backend/src/server.js:317–324, 486–537, 598–727`). Namun route demo `/api/demo`, `/api/reset`, `/api/inspection/submit`, `/api/evidence`, `/api/qa/approve`, `/api/proof`, `/api/anchor`, dan `/api/revoke` tidak memakai autentikasi (`:794–1034`). Proses saat ini bind ke `127.0.0.1` (`:1041`), yang membantu penggunaan lokal; bila reverse proxy memetakan semua path, bind loopback tidak memberi otorisasi aplikasi. Upload demo menerima data lokal ke disk/Pinata.
- CORS mengizinkan request tanpa header `Origin` (`:121`); CORS bukan autentikasi. Tidak ditemukan middleware Helmet/CSP. Error handler dan beberapa catch mengembalikan `error.message` ke pemanggil (`:1037` dan catch route), berpotensi mengungkap detail internal.
- Rate limiter Redis atomik dan mode fail-closed tersedia serta memiliki tes, tetapi pemanggilan aplikasi yang tampak ada terutama pada anchor/revoke. Route resolve/verifikasi publik tidak menunjukkan rate limit. `/health` memeriksa RPC dan menampilkan konfigurasi ringkas (`:308–315`); belum ada `/readyz` terpisah.
- Relayer, service key Supabase, PINATA JWT, dan token secret berada di environment backend. `.env` diabaikan Git, tetapi local secret store/rotasi belum memisahkan relayer ke KMS. `backend/scripts/setup-testnet.mjs` menulis private key relayer ke file `.env` lokal.
- Ada skrip mutasi Supabase yang tidak aman untuk dieksekusi menurut kebijakan fase: `run-sql-direct.mjs`, `push-fix-migration.mjs`, dan `apply-migration.mjs` dapat mengirim SQL tanpa dry-run default/backup/konfirmasi. `migrate-cleanup-storage.mjs` dry-run dan konfirmasi secara default, serta mencadangkan file sebelum penghapusan, tetapi tidak mempunyai prosedur rollback/restore yang terverifikasi. Migrasi `202610100001_privacy_migration.sql` menghapus bucket dan menjatuhkan kolom `bucket_id`/`object_path` (`:8–13`). Tidak satu pun dijalankan; status migrasi live tidak diketahui.

### P1 — Kontrak dan data tepercaya

- ABI backend aktif berisi `anchorProof` 6 argumen dan hanya memakai ABI v1 untuk jalur pembacaan legacy (`backend/src/server.js:41–84`). `PANDU_REGISTRY_ADDRESS` adalah konfigurasi aktif; alamat v1 dibaca khusus lewat `PANDU_LEGACY_REGISTRY_ADDRESS` dan diverifikasi dengan status `LEGACY_UNSIGNED`/`LEGACY_REVOKED` (`:80–84, 766–781`). Pencarian source tidak menemukan alamat literal v1 dalam kode aktif; sisa alamat ada di README, runbook, dan objek legacy `deployment.json`.
- Kontrak (`smart-contract/src/PANDUQualityRegistry.sol:82–117`) membatasi anchor ke `RELAYER_ROLE`, mensyaratkan `ISSUER_ROLE`, memeriksa signature melalui OpenZeppelin `SignatureChecker`, dan menyimpan attester serta relayer. Revoke tersedia melalui penerbit/admin atau signature; `verify` membaca status proof/revoke. Flow lokal lulus, tetapi trust pada alat/lab belum ada: tanda tangan issuer hanya membuktikan siapa yang menyetujui komitmen, bukan bahwa nilai pengukuran benar.
- Jalur API publik memakai `getProof` lalu menghitung hash snapshot/batch dan membandingkan hasilnya secara backend (`backend/src/server.js:784–790`); pencarian tidak menemukan pemanggilan on-chain `verify()` di jalur tersebut. Root README menyebut `verify()` sebagai langkah pemeriksaan (`README.md:52–56`), jadi narasi README perlu disamakan dengan implementasi saat fase dokumentasi.
- Tidak ada implementasi selective disclosure Merkle atau RISC Zero guest/host di repo saat ini. `PANDUAttestorRegistry`, measurement attestation, dan kontrak ZK masih rencana.

### Urutan prioritas yang disarankan

1. Fase 1: pecah server, validasi environment/input, header/error/CORS, siap/live health, dan tes route; tambah CI tanpa mengubah perilaku data.
2. Sebelum Fase 2: tutup temuan mismatch upload dan siapkan desain migrasi aman dengan backup, dry-run, konfirmasi, rollback; jangan jalankan migrasi utama sampai ada persetujuan dan runbook yang ditinjau.
3. Fase 2: desain/enkripsi kolom bisnis dan envelope kunci di klien, kurangi snapshot publik ke komitmen/non-sensitif, amankan kunci browser, lalu tes dump database dan isolasi RLS.
4. Fase 3–5: selective disclosure, sumber alat/lab, dan riset RISC Zero berdasarkan dokumen desain; jangan klaim bahwa QA manual saat ini membuktikan kebenaran fisik.
5. Fase 7 sebelum data nyata: audit independen kontrak, guest ZK, dan kriptografi klien; e2e testnet serta pemindaian secret.

## Batas audit

Pemeriksaan ini bersifat lokal dan statis. Tidak membaca isi `.env`, tidak menjalankan skrip migrasi, tidak membuka koneksi database utama, tidak membaca data pengguna, tidak broadcast/deploy, dan tidak memvalidasi status live address/role kontrak lewat RPC/explorer. Slither menganalisis kontrak lokal dan dependency saja. Hasil ini bukan audit keamanan independen.

Tes dilakukan pada worktree yang sudah memiliki perubahan lokal di luar Fase 0, termasuk `smart-contract/script/Deploy.s.sol`; tidak ada perubahan tersebut yang saya buat atau stage. Baseline menggambarkan worktree saat pengujian, bukan clean checkout dari commit tertentu.

## Status temuan setelah Fase 1

Status ini memperbarui temuan baseline untuk worktree Fase 1 pada 2026-10-10. `Selesai` berarti kontrol yang diminta di fase ini sudah ada dan diuji; itu bukan berarti semua risiko data PANDU sudah hilang.

| Temuan baseline | Status | Bukti / sisa pekerjaan |
|---|---|---|
| Data bisnis plaintext di tabel organisasi dan inspeksi | Belum | Field lama masih plaintext; enkripsi kolom dan key envelopes berada pada Fase 2. Tidak ada DDL atau backfill Supabase dijalankan. |
| Snapshot bisnis tersimpan di `quality_proofs.public_snapshot` | Sebagian | Route publik tidak lagi memilih atau mengembalikan snapshot (`backend/src/routes/public-proofs.js:54–64`), tetapi snapshot masih disimpan dan dipakai jalur aplikasi internal (`backend/src/server.js:526`). |
| Backend menjadi sumber keputusan verifikasi | Selesai | Browser memanggil RPC untuk `getProof`, `isValid`, dan `verify()` serta mencocokkan commitment lokal (`frontend/src/onchain-verification.ts:36–75`; UI `frontend/src/landing/Verify.tsx:164–210`). Endpoint server hanya memberi metadata minimum. |
| API dan constraint database menolak payload `.enc` | Sebagian | API menerima envelope `.enc`, mengabaikan MIME klien, dan membatasi 10 MiB (`backend/src/routes/evidence.js:10–34`). File migrasi idempoten memperbarui constraint (`supabase/migrations/202610100002_ciphertext_mime_constraint.sql`), tetapi belum dijalankan sehingga constraint live belum dipastikan cocok. Roundtrip upload/fetch/decrypt lokal lulus. |
| Recovery phrase dan kunci verifier di Web Storage | Selesai untuk penyimpanan raw | Alur menyimpan kunci di state/memori dan tidak menulis kunci mentah ke local/session storage; tes statis memeriksa alur terkait (`frontend/test/session-secret-storage.test.ts:14–15`). XSS tetap dapat mengakses material ketika sesi aktif. |
| Route demo dapat berjalan tanpa opt-in | Selesai | Route hanya diregistrasi dengan `DEMO_ROUTES=true` di non-production; konfigurasi production menolak flag itu (`backend/src/demo-route-guard.js`, `backend/src/config/runtime.js`). Server bind ke `127.0.0.1` (`backend/src/server.js:931`). |
| Respons publik mengungkap snapshot bisnis | Selesai untuk API publik | Router hanya memilih kolom metadata dan proyeksi tanpa snapshot (`backend/src/routes/public-proofs.js:50–64`; `backend/test/public-proof-routes.test.mjs`). Pencarian kode batch tetap publik dan belum rate-limited. |
| Skrip mutasi/deploy tidak punya guard operasional | Selesai untuk enam skrip yang diminta | Skrip dikarantina di `backend/scripts/danger/`, dry-run sebagai default, `--execute`, konfirmasi target; skrip destruktif memeriksa backup. Mainnet memerlukan dua guard. Tes guard memastikan default tidak menjalankan efek eksternal (`backend/test/danger-script-guard.test.mjs`). Migrasi SQL sendiri tetap file saja. |
| Secret masuk ke riwayat Git | Selesai untuk riwayat yang dipindai | Gitleaks 8.30.1 menemukan 0 temuan pada seluruh riwayat root dan repo smart-contract setelah empat fingerprint false-positive fixture dikecualikan (`.gitleaksignore`); pemindaian working tree juga mencakup file lokal yang di-ignore dan tidak membuktikan file tersebut aman untuk dibagikan. Rotasi dilakukan bila pemeriksaan manual pemilik menemukan kredensial aktif terekspos. |
| Backend monolit, validasi config, logging, health, error, headers, CORS | Sebagian | Zod boot validation, Helmet/CSP, allowlist CORS, request ID/log terstruktur, error handler generik, `/healthz` dan `/readyz` sudah ditambahkan (`backend/src/config/runtime.js`, `backend/src/middleware/`, `backend/src/routes/health.js`). Route organisasi/proof masih besar di `server.js`; validasi belum seragam di semua route. |
| Rate limiting Redis dan konfigurasi production | Sebagian | Tes Redis atomik/fail-closed ada; production memerlukan `TRUST_PROXY`, Redis, dan `RATE_LIMIT_FAIL_CLOSED=true` (`backend/test/rate-limiter.test.mjs`, `backend/src/config/runtime.js`). Penggunaan belum mencakup semua route publik. |
| Relayer nonce, retry, idempotency, gas, stuck tx, saldo | Sebagian | Queue sudah tersambung untuk anchor/revoke dan dites (`backend/src/services/relayer-queue.js`, `backend/test/relayer-queue.test.mjs`). Durable job table dan distributed Redis lock memerlukan migration file `202610100003_relayer_jobs.sql` yang belum dijalankan; job ambigu membutuhkan rekonsiliasi operator. |
| CI root dan repo kontrak terpisah | Selesai sebagai konfigurasi | Workflow terpisah tersedia di `.github/workflows/ci.yml` dan `smart-contract/.github/workflows/ci.yml`; belum dieksekusi oleh GitHub Actions dari branch ini. |
| E2E Playwright dengan wallet/testnet | Belum | Kerangka Playwright baseline tetap tersedia, tetapi wallet E2E lintas anchor/revoke belum dibuat atau dijalankan. |
| Kebenaran fisik pengukuran dan sumber data | Belum | Kontrak v2 mengikat signature issuer tetapi tidak mengesahkan sensor/lab; attestor/ZK tetap fase berikutnya. |

### Klasifikasi tujuh hasil Slither source proyek

`slither . --exclude-dependencies` melaporkan tujuh hasil pada `smart-contract/src/PANDUQualityRegistry.sol`; tidak ada kontrak yang diubah pada Fase 1. Semuanya **diterima/dikenali sebagai false positive desain**, dengan alasan berikut:

| No. | Detector / lokasi | Keputusan |
|---:|---|---|
| 1 | `incorrect-equality`, `getProof`, sentinel `proofId == bytes32(0)` (`PANDUQualityRegistry.sol:152`) | Diterima: equality dipakai untuk mendeteksi slot struct kosong; bukan nilai yang dapat dipilih penyerang setelah proof disimpan. |
| 2 | `incorrect-equality`, `verify`, hash evidence sama persis (`:164`) | Diterima: kesamaan bytes32 adalah kriteria verifikasi integritas yang dimaksud; toleransi/ketaksamaan justru salah. |
| 3 | `timestamp`, deadline `anchorProof` (`:94`) | Diterima: `block.timestamp` dipakai sebagai batas kedaluwarsa signature; ketidakpastian timestamp validator tidak melewati deadline 15 menit aplikasi secara praktis. |
| 4 | `timestamp`, deadline `revokeProofWithSig` (`:138`) | Diterima: sama, pemeriksaan masa berlaku signature. |
| 5 | `timestamp`, `getProof` (`:152`) | Diterima sebagai false positive detector: baris yang dilaporkan membandingkan sentinel proof ID, tidak membaca timestamp. |
| 6 | `timestamp`, `verify` (`:164`) | Diterima sebagai false positive detector: baris yang dilaporkan membandingkan status dan hash, tidak membaca timestamp. |
| 7 | `pragma`, pragma dependency OpenZeppelin `^0.8.20` terhadap source proyek `0.8.28` | Diterima: `0.8.28` memenuhi rentang dependency; Foundry mematok compiler ke versi itu. Tidak ada mismatch bytecode/deployment yang diperkenalkan Fase 1. |

Slither CI memakai `--fail-high` agar menjalankan pemindaian dan gagal pada temuan high impact; ketujuh temuan yang diterima tetap terlihat pada output, jadi hasil ini bukan klaim audit bersih.
