# Rencana Induk Upgrade PANDU — Ringkasan yang Disepakati

Dokumen ini merangkum rencana yang disepakati untuk memindahkan PANDU dari prototipe ke sistem dengan kerahasiaan data di sisi klien, integritas yang dapat dicek publik, dan klaim yang bergantung pada sumber tepercaya. Detail pelaksanaan ada pada permintaan fase masing-masing; kerjakan hanya fase yang secara eksplisit diminta dan berhenti untuk laporan di akhir fase.

## Aturan lintas fase

1. Kontrak v2 di Arbitrum Sepolia `0x2e6aE365874D3b06dA896980D1CFc817Be873EE9` (chain `421614`) tidak diubah atau di-deploy ulang. v1 tetap untuk baca legacy.
2. Tidak ada DDL, migrasi, backfill, atau penghapusan data pada Supabase utama. Skrip mutasi hanya disiapkan untuk pemilik jalankan; default dry-run, backup, konfirmasi, dan rencana rollback.
3. Jangan broadcast transaksi atau deploy. Jangan memakai private key admin. Secret tidak dicetak, tidak masuk frontend atau commit. Tidak ada mainnet.
4. Jangan menganggap mock/dev-mode valid untuk testnet/produksi. Jangan mengarang primitif kriptografi; gunakan Web Crypto, OpenZeppelin v5.x, dan pustaka teruji. Verifikasi dokumentasi dan versi terkini untuk teknologi yang berubah.
5. Kerjakan di Windows `C:\MUTU`; beri langkah WSL2 jika toolchain membutuhkannya, tanpa memasang komponen besar tanpa pemberitahuan.
6. Redesain UI berlangsung di branch lain; fase ini mengubah logika/data saja kecuali UI minimal untuk status yang benar.
7. Branch terpisah per fase, satu commit per butir, jalankan test/build sebelum commit. Laporan akhir hanya keputusan, file, hasil verifikasi, risiko, dan langkah manual.

## Fase dan batasnya

- **Fase 0 — Audit/baseline:** peta repo, dependency dan risiko; jalankan baseline Solidity/Slither/backend/frontend; telusuri anchor/revoke/verify; tulis `docs/BASELINE_REPORT.md` dan `docs/THREAT_MODEL.md`; berhenti menunggu persetujuan.
- **Fase 1 — Fondasi rekayasa:** CI terpisah untuk root dan repo kontrak; modularisasi backend, validasi Zod saat boot, logging tanpa PII, readiness/health, error/security middleware; relayer yang antre/idempotent/retry-safe; rate limit Redis fail-closed; E2E harness; `docs/ARCHITECTURE.md`.
- **Fase 2 — Enkripsi dan kunci:** ODK acak per organisasi, envelope KEK multi-anggota, undangan terenkripsi, rotasi/recovery, AES-GCM dengan AAD, enkripsi kolom sensitif, blind index seminimal mungkin, HMAC identitas Google, RLS key envelope, migrasi dual-write/backfill di klien/drop terpisah. Siapkan runbook backup/rollback; berhenti sebelum menyentuh Supabase utama.
- **Fase 3 — Merkle/selective disclosure:** definisi leaf/node deterministik dengan test vector bersama TypeScript/Rust; bukti per-field; halaman publik hanya membuka field yang dipilih; penerbit meninjau root/snapshot sebelum EIP-712.
- **Fase 4 — Kontrak tambahan:** registry attestor, measurement attestation, dan ZK attestation berbasis OpenZeppelin v5 serta proof v2. NFT opsional memerlukan persetujuan tersendiri. Evaluasi registry v3, jangan implementasi tanpa persetujuan. Tes unit/fuzz/invariant, gas, Slither, skrip tanpa broadcast, audit package; berhenti sebelum deploy.
- **Fase 5 — RISC Zero:** riset versi/verifier/dukungan host dan kebutuhan resource lebih dulu, lalu berhenti untuk persetujuan. Setelah disetujui, guest membuktikan rentang nilai dari Merkle proof secara lokal; nilai dan salt tidak masuk journal atau server. Dokumentasikan trusted setup, image ID, dan batas klaim.
- **Fase 6 — Integrasi aplikasi:** backend hanya menerima proof/attestation, bukan nilai plaintext atau kunci; UI membedakan lapisan tanda tangan, attestor, ZK, revoke, dan legacy; indexer opsional dengan reorg handling.
- **Fase 7 — Kualitas dan testnet:** E2E testnet, audit npm/cargo/Slither/secrets, inspeksi dump untuk plaintext, runbook insiden/backup/rotasi, daftar keterbatasan, serta kesiapan audit independen. Jangan gunakan data nyata sebelum audit.

## Fase aktif pada branch ini

Fase 1 yang diminta saat ini dimulai dengan **Fase 1A perbaikan mendesak**: verifikasi on-chain di browser, upload ciphertext konsisten, kunci hanya di memori sesi, route demo opt-in dan non-production, respons publik tanpa snapshot bisnis, karantina skrip berbahaya dengan guard, serta pemindaian sejarah secret. Setelah itu kerjakan fondasi CI/backend/relayer/rate limit/arsitektur dari Fase 1. Tidak ada perubahan database live atau tindakan blockchain.
