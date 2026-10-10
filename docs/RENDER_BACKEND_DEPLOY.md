# Deploy backend PANDU ke Render

Blueprint `render.yaml` menyiapkan satu Render Web Service dari folder `backend/`.
Ia memakai instance Free untuk smoke test dan deploy manual (`autoDeploy: false`),
tanpa membuat database atau mengubah Supabase.

## Sebelum deploy

Service production hanya akan start jika seluruh environment wajib tersedia.
Siapkan terlebih dahulu:

- URL Supabase dan secret key server-only.
- URL Redis TLS (`rediss://`) untuk rate limiter dan lock relayer.
- Origin frontend yang tepat, misalnya `https://<domain-vercel>` untuk
  `CORS_ALLOWED_ORIGINS` dan `FRONTEND_ORIGIN`.
- JWT Pinata, private key relayer testnet, dan alamat registry Sepolia.
- Pastikan tabel `relayer_jobs` tersedia di Supabase; readiness check memerlukan
  tabel tersebut. Blueprint memakai `/healthz` untuk liveness agar service dapat
  start sebelum dependency readiness diperiksa.

Jangan gunakan service key Supabase atau private key relayer sebagai variabel
frontend `VITE_*`. Jangan gunakan wallet berisi aset mainnet. `PANDU_CHAIN`
disetel ke `arbitrum-sepolia`, dan route demo dinonaktifkan.

## Membuat service

1. Push commit yang berisi `render.yaml` dan perubahan bind port ke branch yang
   akan dipakai Render.
2. Di Render Dashboard, pilih **New → Blueprint**, lalu hubungkan repo ini.
   Blueprint berada di root repo; `rootDir: backend` memilih aplikasi API.
3. Isi nilai untuk variabel `sync: false` saat diminta. Nilai rahasia hanya masuk
   ke Render. `GOOGLE_SUB_PEPPER` dan `PUBLIC_TOKEN_SECRET` dibuat oleh Render.
4. Pastikan environment `REDIS_URL` mengarah ke Redis yang sudah tersedia.
   Blueprint tidak otomatis membuat layanan Redis berbayar.
5. Jalankan deploy service. Liveness endpoint adalah `/healthz`; setelah konfigurasi
   Supabase dan tabel relayer siap, periksa `/readyz` untuk readiness.
6. Salin URL `https://<service>.onrender.com`, set sebagai `VITE_API_URL` pada
   project frontend Vercel, lalu deploy ulang frontend.

## Batasan

- Plan Free dapat sleep saat idle dan filesystem lokalnya tidak persisten. State
  demo lokal tidak cocok untuk production; route demo tetap dimatikan. Data bisnis
  harus tetap di Supabase dan file ciphertext di Pinata.
- Ini menyiapkan konfigurasi, bukan membuat service di akun Render. Deployment
  memerlukan akses dashboard Render dan nilai secret pemilik layanan.
- Belum ada migrasi database yang dijalankan oleh Blueprint.
