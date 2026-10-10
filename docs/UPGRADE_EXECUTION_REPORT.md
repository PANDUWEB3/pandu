# Laporan Eksekusi Upgrade PANDU Fase 2–7

Tanggal pemeriksaan: 2026-10-10. Laporan ini diperbarui pada setiap gerbang fase.

## Keadaan Git yang diverifikasi

- Root repo diverged during work: the phase branch was externally renamed to `main` (reflog records `Branch: renamed refs/heads/feat/fase-2-encryption to refs/heads/main`). I restored `feat/fase-2-encryption` at the same commit. `feat/upgrade-all` remains at `61c3732`; repo contract `feat/upgrade-all` remains at `2d0a502`.
- Workspace bersih sebelum pekerjaan Fase 2. Branch kerja aktif: `feat/fase-2-encryption` pada kedua repo.
- Repo v2 tidak dimodifikasi dan tidak ada transaksi, deployment, grant role, akses Supabase utama, atau pembacaan secret.

## Status fase

| Fase | Status | Bukti dan batas |
|---|---|---|
| 2 — Enkripsi data dan kunci | **Sebagian** | Primitive AES-GCM/AAD, pembungkusan ODK, PBKDF2 recovery, ECDH invitation, rotasi kid, blind-index HMAC, migrasi aditif, RLS key envelope, RPC ciphertext-only, dan klasifikasi kolom sudah ditambahkan. Namun Workspace belum dipindahkan penuh ke ODK/envelope; flow proof lama masih membaca plaintext dan test SQL lokal belum dijalankan karena `supabase`, `psql`, dan Docker tidak tersedia. Tidak aman menyatakan Fase 2 selesai. |
| 3 — Merkle/selective disclosure | **Belum dimulai** | Menunggu gerbang Fase 2 dan implementasi aplikasi ciphertext-only. |
| 4 — Kontrak tambahan | **Belum dimulai** | Tidak ada perubahan kontrak. |
| 5 — RISC Zero | **Belum dimulai** | Cargo/RISC Zero belum tersedia atau dipasang. |
| 6 — Integrasi aplikasi | **Belum dimulai** | Menunggu fase sebelumnya. |
| 7 — Kualitas/dokumentasi | **Sebagian** | Laporan dan fallback scan disiapkan; audit akhir dan E2E harness belum dikerjakan. |

## File yang ditambahkan/diubah pada Fase 2

Root repo:

- `frontend/src/dbcrypto.ts`, `frontend/test/dbcrypto.test.ts`
- `backend/src/security/db-envelope.js`, `backend/src/security/identity-hash.js`
- `backend/src/config/runtime.js`, `backend/test/runtime-config.test.mjs`, `backend/test/database-privacy.test.mjs`
- `supabase/migrations/202610100004_client_side_encryption.sql`
- `supabase/tests/202610100004_key_envelopes_rls.sql` (siap untuk Supabase lokal; belum dijalankan)
- `supabase/migrations/202610100005_drop_plaintext_after_verified_cutover.sql` (manual saja, belum dijalankan)
- `docs/KEY_MANAGEMENT.md`, `docs/UPGRADE_EXECUTION_REPORT.md`, `scripts/security-fallback-scan.ps1`

Repo kontrak:

- `slither-baseline.json`, `script/compare-slither-baseline.mjs`

Dependensi baru: tidak ada. Web Crypto API dan dependensi Zod yang sudah ada dipakai.

## Gerbang dan pemindaian

| Gerbang | Hasil |
|---|---|
| `forge build` | Lulus; `solc 0.8.28` |
| `forge test` | **29 lulus, 0 gagal, 0 skip** (baseline; tidak ada perubahan Solidity Fase 2) |
| `forge fmt --check` | Lulus |
| Slither | **7 baseline, 0 baru** pada Fase 2. JSON dibandingkan dengan `node script/compare-slither-baseline.mjs slither-baseline.json <report.json>`. Baseline di `smart-contract/slither-baseline.json` mengklasifikasikan semua temuan. |
| Backend test | **36 lulus, 0 gagal, 0 skip** |
| Backend build | Lulus (`node -c src/server.js`) |
| Frontend test | **58 lulus, 0 gagal**, 10 file |
| `tsc`/frontend build | Lulus (`tsc -b` + Vite 6.4.4) |
| `npm audit` | Backend **0 vulnerabilities**; frontend **0 vulnerabilities** |
| `gitleaks version` | Command tidak tersedia. Fallback `scripts/security-fallback-scan.ps1 -History` dijalankan di root: 2 file kerja/4 commit cocok dengan pola key/token/hash; file adalah vector EIP-712 dan canonical hash, sedangkan match historis `Verify.tsx` adalah sentinel hash pada kondisi revoke. Di repo kontrak: 15 file/7 commit cocok; semuanya berada di vendored forge-std, test/fixture, deployment/verification JSON, atau dokumentasi berisi nilai hash/alamat publik. Ini pemindaian pola terbatas, bukan pengganti penuh Gitleaks. |
| SQL lokal | Belum dapat dijalankan; `supabase`, `psql`, dan Docker tidak ada pada PATH. Tidak ada migrasi yang dieksekusi. |

## Keputusan dan risiko saat ini

- Semua field ciphertext memakai AES-256-GCM dengan IV acak 12 byte dan AAD yang memuat organization/table/row/column/kid. PBKDF2-SHA256 ditetapkan 600.000 iterasi dengan salt acak; tidak ada dependensi kriptografi baru.
- Blind index hanya tersedia sebagai primitive HMAC dengan kunci khusus. Belum ada kolom blind index atau nilai bisnis berkardinalitas rendah yang diindeks.
- Migrasi plaintext-drop menunggu client backfill, verifikasi, perubahan RPC dan pemeriksaan restore di database lokal. Jangan jalankan sebelum semua prasyaratnya dibuktikan.
- Risiko utama yang belum terselesaikan: Workspace belum menggunakan key envelope untuk membaca/menulis semua tabel; proof API lama masih memproses plaintext; flow ECDH belum terhubung ke undangan anggota; rotasi bertahap belum ada worker UI. Karena itu Fase 2 masih parsial, meski gerbang kode yang tersedia lulus.
- Jangan gunakan data nyata sebelum seluruh alur klien selesai dan audit independen dilakukan.

## Lanjutan

Jalankan gerbang lengkap Fase 2, perbaiki setiap regresi/temuan baru, commit dan fast-forward hanya setelah gerbang lolos. Sesudah itu lanjut Fase 3 tanpa deploy atau menyentuh Supabase utama.
