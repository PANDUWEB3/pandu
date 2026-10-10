# Panduan uji end-to-end — PANDUQualityRegistry v2

Jalankan urutan ini secara manual di **Arbitrum Sepolia, chain 421614**. Ini menggunakan kontrak yang sudah ada; jangan deploy ulang.

## Alamat dan kondisi awal

| Peran / kontrak | Alamat / nilai |
| --- | --- |
| Registry v2 aktif | [`0x2e6aE365874D3b06dA896980D1CFc817Be873EE9`](https://sepolia.arbiscan.io/address/0x2e6aE365874D3b06dA896980D1CFc817Be873EE9) |
| Registry v1 legacy, read-only | `0x205a0463504FDC40812758edc59b2C6ad6813990` |
| Admin awal | `0xD9C89f86E7B2d08cd735A04605a29D593a670bd8` |
| Relayer | `0x8889f836EbBAA6c27d4aa88AF9c585968D1Dc5cB` |
| Admin delay | `172800` detik (2 hari) |
| Anchor v2 selector | `0x2aed289c` untuk `anchorProof(bytes32,bytes32,bytes32,address,uint256,bytes)` |
| Anchor v1 selector | `0xead7a752`; tidak memiliki signature penerbit, UI harus menampilkan legacy/tanpa tanda tangan |

Alamat publik issuer belum dicatat di manifest; gunakan alamat MetaMask issuer yang akan Anda beri `ISSUER_ROLE`. Admin, issuer, dan relayer harus tetap menjadi akun yang tepat untuk masing-masing peran. Sourcify saat ini melaporkan `match`; verifikasi Arbiscan belum dikirim dan status API belum terkonfirmasi karena key lokal kosong.

## Urutan pengujian

1. **Berikan role dari akun admin.** Gunakan [panduan grant manual](../smart-contract/docs/GRANT_ROLE_MANUAL.md). Beri `ISSUER_ROLE` ke wallet MetaMask issuer dan, karena kontrak tidak otomatis memberi `PAUSER_ROLE` saat deploy, beri `PAUSER_ROLE` ke akun operasi yang akan menjalankan langkah pause. Pastikan `hasRole` masing-masing bernilai `true` setelah transaksi masuk chain.
2. **Siapkan sesi issuer.** Login ke aplikasi dengan Google, lalu sambungkan MetaMask menggunakan wallet issuer yang sama. Pastikan jaringan wallet Arbitrum Sepolia dan wallet memiliki saldo gas untuk interaksi wallet yang diminta aplikasi.
3. **Buat proof baru.** Isi inspeksi batch baru, lampirkan bukti, dan setujui status QC/QA. Jangan gunakan proof yang sudah pernah di-anchor.
4. **Tandatangani proof.** Tinjau snapshot/hash, lalu setujui typed-data EIP-712 `Anchor` di MetaMask sebagai issuer. Domain harus `name=PANDUQualityRegistry`, `version=2`, `chainId=421614`, dan `verifyingContract=0x2e6aE365874D3b06dA896980D1CFc817Be873EE9`.
5. **Anchor melalui relayer.** Tunggu transaksi sukses, lalu buka transaksi di [Arbiscan Sepolia](https://sepolia.arbiscan.io/address/0x2e6aE365874D3b06dA896980D1CFc817Be873EE9). Periksa input selector `0x2aed289c`. Selector v1 `0xead7a752` berarti transaksi tidak memakai kontrak/ABI v2 yang benar.
6. **Periksa `getProof(proofId)`.** `attester` harus sama dengan wallet issuer yang menandatangani; `relayer` harus sama dengan wallet backend `0x8889f836EbBAA6c27d4aa88AF9c585968D1Dc5cB` dan berbeda dari `attester`. Pastikan batch dan `evidenceHash` cocok dengan proof.
7. **Verifikasi proof.** Panggil `verify(proofId, evidenceHash)` dan pastikan hasil `true`; buka halaman publik verifier dan pastikan detail cocok. Proof v1 harus tetap diberi label **Legacy, tanpa tanda tangan penerbit**, tidak boleh diberi status terverifikasi.
8. **Revoke proof.** Sebelum pause, ajukan revoke lewat alur aplikasi/relayer dengan tanda tangan EIP-712 `Revoke`, atau panggil `revokeProof(proofId, reasonHash)` dari issuer/admin. Periksa event dan pastikan `isValid(proofId)` serta `verify(proofId, evidenceHash)` menjadi `false`.
9. **Pause sebagai langkah terakhir.** Akun pemegang `PAUSER_ROLE` memanggil `pause()`. Pastikan `paused()` bernilai `true`. Jika menguji pengamanan, coba anchor proof uji baru dan pastikan revert `EnforcedPause`; sesudahnya panggil `unpause()` agar kontrak kembali siap dipakai. Jangan meninggalkan testnet dalam keadaan paused.

Pemeriksaan read-only semua status yang tersedia:

```powershell
cd smart-contract
.\script\CheckRoles.ps1 -IssuerAddress '<alamat-publik-issuer>'
```

Skrip memeriksa chain ID, role admin/relayer/issuer, memastikan relayer bukan admin atau issuer, `defaultAdminDelay`, dan `paused`. Tanpa `-IssuerAddress`, status issuer akan ditandai `SKIP`.

## Error umum

| Error | Penyebab umum | Solusi |
| --- | --- | --- |
| `NotIssuer` | Alamat `attester` belum memegang `ISSUER_ROLE`, atau signature dibuat oleh wallet lain. | Grant `ISSUER_ROLE` ke alamat MetaMask yang benar, sambungkan wallet itu, lalu buat dan tandatangani ulang proof. |
| `SignatureExpired` | Deadline EIP-712 sudah lewat ketika relayer mengirim transaksi. | Minta payload baru dan tanda tangani lagi; kirim sebelum deadline. |
| `InvalidSignature` | Domain, chain, kontrak, field, deadline, atau signer berbeda dari payload yang diverifikasi; data juga mungkin berubah setelah ditandatangani. | Pastikan chain 421614 dan verifyingContract v2, gunakan payload terbaru tanpa mengubah field, lalu tanda tangani ulang dari issuer yang ber-role. |
| `EnforcedPause` | Registry sedang paused sehingga anchor ditolak. | Pemegang `PAUSER_ROLE` memanggil `unpause()` lalu ulangi anchor setelah `paused()` menjadi `false`. |

## Catatan keamanan

File asli tidak dicatat on-chain. Anchor menyimpan komitmen/hash; file yang diunggah sebaiknya ciphertext yang dienkripsi client-side. Jangan menaruh private key, API key, file plaintext, atau data rahasia dalam transaksi, calldata, manifest, atau dokumen runbook.
