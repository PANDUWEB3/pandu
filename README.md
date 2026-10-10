# PANDU — Quality Proof (v2)

PANDU mencatat pemeriksaan batch, memisahkan pekerjaan QC dan QA, mengenkripsi dokumen bukti langsung di sisi klien (client-side AES-GCM), mengunggah ciphertext ke IPFS (Pinata), dan merekam komitmen bukti digital on-chain ke kontrak **PANDUQualityRegistry v2** di jaringan Arbitrum.

> [!WARNING]
> **ABI v1 dan v2 tidak kompatibel.** Kontrak v2 aktif di [Arbiscan Sepolia](https://sepolia.arbiscan.io/address/0x2e6aE365874D3b06dA896980D1CFc817Be873EE9) (chain 421614) dan mewajibkan tanda tangan EIP-712 dari penerbit ber-role `ISSUER_ROLE`. Kontrak v1 `0x205a0463504FDC40812758edc59b2C6ad6813990` disimpan sebagai legacy hanya untuk membaca proof lama; proof v1 tidak memiliki tanda tangan penerbit. Status Sourcify: **match** untuk creation dan runtime. Verifikasi Arbiscan belum dikirim; API mengembalikan `Missing/Invalid API Key`, sehingga status source Arbiscan belum terkonfirmasi dalam pemeriksaan ini.

---

## 1. Arsitektur Sistem (v2)

```mermaid
flowchart TD
  subgraph Frontend [Klien Web (React + Vite)]
    USER[QC / QA / Admin] -->|Login Google| AUTH[Supabase Auth (sub hash)]
    USER -->|Tanda Tangan EIP-712| WALLET[Wallet / MetaMask]
    USER -->|Enkripsi AES-GCM 256-bit| CIPHER[Ciphertext Berkas]
  end

  subgraph Relayer [Backend API (Express)]
    CIPHER -->|Signed Upload (JWT aman di server)| PINATA[Pinata IPFS]
    PINATA -->|Kembalikan CID| CANONICAL[Hitung Canonical Proof & SHA-256 Digest]
    CANONICAL --> RELAY[Relayer Service (sendWithRetry)]
  end

  subgraph Blockchain [Arbitrum Network]
    RELAY -->|anchorProof / revokeProofWithSig| CONTRACT[PANDUQualityRegistry v2]
  end

  subgraph Verifier [Publik / Buyer (Tanpa Login)]
    BUYER[Buyer / Auditor] -->|Scan QR / /verify/:token| PUBAPI[Public Verify API]
    PUBAPI -->|getProof / verify| CONTRACT
    BUYER -->|Dekripsi lokal & cocokkan hash| VERIF_CLIENT[Verifikasi SHA-256 di Browser]
  end
```

---

## 2. Alur Operasional

### A. Alur Anchor Bukti (Anchor Flow)
1. **Inspeksi QC**: Petugas QC mengisi data batch dan hasil inspeksi di Workspace. Berkas dokumen dienkripsi langsung di browser menggunakan AES-GCM 256-bit (kunci dari wallet / WebAuthn).
2. **Unggah Ciphertext**: Ciphertext diunggah ke backend, yang menyimpannya ke IPFS Pinata (JWT hanya tersimpan aman di server). Berkas asli tidak pernah meninggalkan perangkat dalam keadaan polos.
3. **Persetujuan QA**: Pengawas QA meninjau hasil uji. Jika lolos (PASS), QA menandatangani payload EIP-712 bertipe `Anchor`.
4. **Relaying Transaksi**: Backend memverifikasi bahwa QA memegang `ISSUER_ROLE` pada kontrak v2, lalu relayer mengeksekusi fungsi `anchorProof(proofId, batchRef, evidenceHash, attester, deadline, signature)` ke jaringan Arbitrum dengan mekanisme retry eksponensial.

### B. Alur Pencabutan Bukti (Revoke Flow)
1. **Pengajuan Revoke**: Penerbit asli atau admin memilih proof yang ingin dicabut dan memasukkan alasan pencabutan.
2. **Tanda Tangan Revoke EIP-712**: Penerbit menandatangani typed data `Revoke` berisi `proofId`, `reasonHash` (keccak256 dari teks alasan), dan `deadline`.
3. **Eksekusi On-Chain**: Relayer mengirimkan transaksi `revokeProofWithSig` tanpa membebani penerbit dengan biaya gas. Status proof diubah menjadi `REVOKED` secara permanen dan memancarkan event `ProofRevoked`.

### C. Alur Verifikasi Publik (Verify Flow)
1. **Akses Publik**: Buyer atau auditor membuka tautan atau memindai QR code (`/verify/:token`) tanpa perlu login atau menghubungkan wallet.
2. **Pengecekan On-Chain**: Sistem memanggil fungsi view `getProof(proofId)` dan `verify(proofId, evidenceHash)` pada kontrak v2 di Arbitrum.
3. **Pencocokan Data**: Memastikan komitmen SHA-256 dari canonical snapshot (disusun dari metadata deterministik, CID, dan salt 32-byte) cocok dengan `evidenceHash` on-chain.
4. **Verifikasi Berkas Lokal**: Verifier dapat mengunggah berkas yang telah mereka dekripsi secara lokal di peramban mereka untuk mencocokkan hash SHA-256 secara langsung dengan komitmen on-chain.

---

## 3. Konfigurasi Lingkungan (.env)

### Backend (`backend/.env`)
Salin dari `backend/.env.example`:
```ini
# Supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR_SECRET_KEY

# Blockchain
PANDU_CHAIN=arbitrum-sepolia
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc

# Kontrak & Role PANDUQualityRegistry v2
PANDU_REGISTRY_ADDRESS=0x2e6aE365874D3b06dA896980D1CFc817Be873EE9
PANDU_LEGACY_REGISTRY_ADDRESS=0x205a0463504FDC40812758edc59b2C6ad6813990
DEPLOYER_PRIVATE_KEY=0xPrivateKeyWalletDeploy
RELAYER_PRIVATE_KEY=0xPrivateKeyRelayerUntukKirimTx
ADMIN_MULTISIG_ADDRESS=0xAlamatMultisigAdmin
ISSUER_ADDRESS=0xAlamatPenerbitQAYangDiberiIssuerRole
INITIAL_RELAYER=0xAlamatWalletRelayer

# Pinata IPFS (Server-Only JWT)
PINATA_JWT=ey...

# Keamanan Token Publik
PUBLIC_TOKEN_SECRET=32_Karakter_Acak_Untuk_HMAC_Token

# Server
PORT=8787
FRONTEND_ORIGIN=http://localhost:5173
```

### Frontend (`frontend/.env.local`)
Salin dari `frontend/.env.example`:
```ini
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_ANON_KEY
VITE_API_URL=http://localhost:8787
```

---

## 4. Panduan Deploy Kontrak v2 (Foundry)

Seluruh kontrak pintar dan skrip migrasi berada di direktori `smart-contract/`.

### 1. Build & Jalankan Unit Test
```powershell
cd smart-contract
forge build
forge test
forge coverage
```
*Hasil pengujian: 29/29 tests pass, 100% statement coverage pada `PANDUQualityRegistry.sol`.*

### 2. Deploy ke Arbitrum Sepolia
```powershell
forge script script/Deploy.s.sol:Deploy --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify --verifier sourcify
```
Kontrak v2 yang aktif sudah di-deploy pada `0x2e6aE365874D3b06dA896980D1CFc817Be873EE9`; jangan deploy ulang untuk migrasi ini. Source tercatat sebagai `match` di Sourcify. Verifikasi Arbiscan belum dikirim karena `ETHERSCAN_API_KEY` lokal kosong, dan statusnya belum dapat diperiksa lewat API (`Missing/Invalid API Key`). Konfigurasi aktif menggunakan alamat v2; alamat v1 hanya ada di `PANDU_LEGACY_REGISTRY_ADDRESS` dan bagian `legacy` di `smart-contract/deployment.json` untuk membaca proof lama. Jangan menandai proof v1 sebagai terverifikasi karena anchor v1 tidak memeriksa tanda tangan penerbit.

### 3. Memberikan Role (Grant Roles)
Jalankan skrip grant role untuk memberikan `ISSUER_ROLE` kepada QA dan `PAUSER_ROLE` kepada tim operasi/multisig:
```powershell
forge script script/GrantRoles.s.sol:GrantRoles -vvv
```
Skrip ini hanya mencetak calldata. Eksekusi `grantRole(ISSUER_ROLE, ISSUER_ADDRESS)` dari akun admin pada kontrak v2 setelah memeriksa target dan alamat penerbit.

---

## 5. Menjalankan Aplikasi Secara Lokal

### Terminal 1: Backend API
```powershell
cd backend
npm install
npm run dev
```

### Terminal 2: Frontend
```powershell
cd frontend
npm install
npm run dev
```
Buka peramban di `http://localhost:5173`.
