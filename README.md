# PANDU — Quality Proof (v2)

PANDU mencatat pemeriksaan batch, memisahkan pekerjaan QC dan QA, mengenkripsi dokumen bukti langsung di sisi klien (client-side AES-GCM), mengunggah ciphertext ke IPFS (Pinata), dan merekam komitmen bukti digital on-chain ke kontrak **PANDUQualityRegistry v2** di jaringan Arbitrum.

> [!WARNING]
> **INKOMPATIBILITAS ABI v1 & v2**: ABI v1 sama sekali tidak kompatibel dengan v2. Kontrak v2 mewajibkan penandatanganan EIP-712 oleh penerbit berlisensi (`ISSUER_ROLE`), pemisahan relayer tanpa gas untuk pengguna, fungsi `revokeProofWithSig` dengan `reasonHash`, serta pencegahan reentrancy dan pause guard. Deploy ulang kontrak v2 diperlukan sebelum produksi.

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
PANDU_REGISTRY_ADDRESS=0xAlamatKontrakSetelahDeploy
RELAYER_PRIVATE_KEY=0xPrivateKeyRelayerUntukKirimTx
ADMIN_MULTISIG_ADDRESS=0xAlamatMultisigAdmin
ISSUER_ADDRESS=0xAlamatPenerbitQAYangDiberiIssuerRole

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
forge script script/Deploy.s.sol:Deploy --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify
```
Catat alamat kontrak yang dihasilkan, lalu masukkan ke `PANDU_REGISTRY_ADDRESS` di `backend/.env` dan `smart-contract/deployment.json`.

### 3. Memberikan Role (Grant Roles)
Jalankan skrip grant role untuk memberikan `ISSUER_ROLE` kepada QA dan `PAUSER_ROLE` kepada tim operasi/multisig:
```powershell
forge script script/GrantRoles.s.sol:GrantRoles --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast
```

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
