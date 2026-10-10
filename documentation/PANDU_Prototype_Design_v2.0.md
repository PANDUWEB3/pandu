# PANDU — Prototype & UI Design Specification

**Versi:** 2.0  
**Tujuan:** Panduan prototipe web React yang sederhana untuk QC, QA, dan pembeli yang belum terbiasa dengan blockchain  
**Acuan:** [Blueprint v2.0](PANDU_ERP_Master_Blueprint_v2.0.md) · [PRD v2.0](PANDU_PRD_v2.0.md)

## 1. Arah desain

PANDU harus terasa seperti alat kerja PANDU yang tenang dan terpercaya. Pengguna datang untuk mencatat dan memeriksa hasil, bukan untuk melihat crypto. Gunakan bahasa sehari-hari, satu aksi utama per halaman, navigasi umum, form/table yang familiar, dan detail teknis hanya bila diminta.

### Prinsip

- Tunjukkan lokasi pengguna, status pekerjaan, dan langkah berikutnya.
- Satu tombol utama yang jelas; aksi sekunder tidak bersaing.
- Jelaskan status dengan teks dan ikon, bukan warna saja.
- Gunakan kartu hanya ketika membantu mengelompokkan informasi.
- Tidak ada dekorasi crypto, neon, koin, gradient mencolok, atau animasi berulang.
- Semua aksi penting bekerja dengan keyboard dan mempunyai fokus terlihat.

## 2. Pengguna dan navigasi

```text
PANDU
├── Ringkasan
├── Batch
│   ├── Daftar batch
│   └── Detail batch
├── Pemeriksaan
│   ├── Pemeriksaan saya
│   └── Review QA
└── Bukti PANDU
    ├── Daftar proof
    └── Verifikasi publik (tautan tanpa login)
```

P0 tidak perlu menu Master Data, Pengaturan, dan Audit Log terpisah yang kompleks. Data contoh cukup tersedia dari batch demo. Audit ringkas ditampilkan di dalam detail batch/proof.

## 3. Tema dan token visual

Gunakan satu tema terang pada seluruh aplikasi, termasuk halaman verifikasi publik.

| Token | Warna | Penggunaan |
|---|---|---|
| `brand-700` | `#176B57` | Tombol utama, tautan aktif, aksen PANDU |
| `brand-100` | `#E6F2EE` | Latar lembut untuk status netral/terpilih |
| `ink-900` | `#182522` | Judul dan isi utama |
| `ink-600` | `#53635E` | Label dan teks sekunder |
| `canvas` | `#F5F7F5` | Latar aplikasi |
| `surface` | `#FFFFFF` | Form, tabel, panel |
| `line` | `#DCE4DF` | Garis pemisah dan border |
| `success` | `#26734D` | Lulus / bukti cocok |
| `warning` | `#9A6200` | Menunggu / perlu tindakan |
| `danger` | `#B33B32` | Gagal / bukti berubah / dicabut |
| `info` | `#356B9A` | Informasi jaringan dan bantuan |

Warna status selalu dipasangkan dengan label eksplisit dan ikon. Jangan menggunakan merah/hijau sebagai satu-satunya pembeda.

### Tipografi dan bentuk

- Sans-serif yang jelas: Inter/system UI; jangan mencampur banyak font.
- Judul halaman 24–28 px; judul bagian 18–20 px; isi 14–16 px; metadata minimum 12 px.
- Grid jarak 4/8 px. Kontrol minimum 40 px tinggi. Radius 8–12 px.
- Lebar konten maksimal sekitar 1200 px. Tabel padat tetapi tetap nyaman dibaca.
- Fokus keyboard berwarna `brand-700` dengan outline jelas.

## 4. Komponen React Bits

React Bits adalah kumpulan komponen React yang dapat dikustomisasi dan dipasang per komponen. Gunakan sebagai **sumber komponen interaksi/animasi**, bukan sebagai pengganti design system atau komponen form/data PANDU. Salin varian TS + CSS/Tailwind yang sesuai stack proyek, sesuaikan warna token di atas, cek dependensi dan lisensi upstream sebelum mengadopsi. Sumber: [React Bits](https://reactbits.dev/get-started/index), [GitHub](https://github.com/DavidHDev/react-bits).

| Komponen React Bits | Pemakaian yang disarankan | Batasan |
|---|---|---|
| **Fade Content** | Masuknya panel/status setelah action sukses | Durasi singkat; hormati `prefers-reduced-motion` |
| **Animated Content** | Pengungkapan detail opsional pada proof | Jangan animasikan tabel atau seluruh halaman |
| **Count Up** | Opsional untuk satu angka ringkasan | Hanya jika nilai nyata; jangan menghitung transaksi tiruan |
| **Background / text effect** | Tidak digunakan di aplikasi operasional | Mengganggu keterbacaan dan nuansa industri |

Gunakan dokumentasi/instalasi pada halaman komponen React Bits saat implementasi; nama dan perintah CLI dapat berubah. Jangan menambah dependency tanpa memeriksa ukuran bundle, aksesibilitas, SSR compatibility, lisensi, dan motion behavior. Form, tabel, dialog, status badge, sidebar, dan layout aplikasi dibuat dengan komponen proyek yang semantik dan konsisten.

## 5. Struktur layar

### 5.1 Ringkasan

**Judul:** Pekerjaan PANDU  
**Deskripsi:** Lihat batch yang perlu diperiksa atau disetujui.

Urutan konten:

1. Satu panel “Perlu tindakan” dengan jumlah inspeksi menunggu dan tombol **Buka review QA** atau **Mulai pemeriksaan** sesuai peran.
2. Tabel “Batch terbaru”: Batch, Bahan, Pemasok, Status, aksi **Lihat batch**.
3. Panel “Bukti PANDU terbaru” berisi nama proof dan status anchor dalam bahasa sederhana.

Jangan menjadikan jumlah transaksi atau hash sebagai KPI utama.

### 5.2 Detail batch

Header: `ST-2026-001` · Pelat baja SS400 · PT Baja Nusantara · badge status.

Tampilkan alur ringkas vertikal: Batch dibuat → Diperiksa → Disetujui QA → Bukti PANDU dibuat → Direkam di blockchain. Tiap langkah menunjukkan status dan waktu. Tampilkan satu aksi sesuai status:

- Belum diperiksa: **Mulai pemeriksaan**
- Menunggu QA: **Lihat hasil pemeriksaan**
- Disetujui: **Buat bukti PANDU**
- Proof dibuat: **Rekam bukti**
- Terekam: **Buka bukti publik**

### 5.3 Form pemeriksaan

```text
Pemeriksaan ketebalan
Batch: ST-2026-001

Batas yang diizinkan     9,5 – 10,5 mm
Hasil pengukuran         [ 10,0 ] mm
Hasil                    ✓ Lulus
Bukti pendukung          [ Tambah file ]
Catatan (opsional)       [ ... ]

[Simpan draft]                         [Kirim ke QA]
```

Hasil dihitung server. Jika gagal, tampilkan “Di luar batas yang diizinkan” dan langkah yang tersedia. Jangan izinkan pengguna mengganti status dengan dropdown PASS/FAIL.

### 5.4 Review QA

Tampilkan ringkasan nilai aktual vs batas, file bukti sebagai nama + tipe + waktu, pengirim, dan riwayat singkat. Aksi **Setujui pemeriksaan** menjadi tombol utama; **Tolak** sebagai aksi sekunder dengan input alasan. Modal konfirmasi menyebut dampak: “Setelah disetujui, QA dapat membuat bukti PANDU yang bisa dibagikan.”

### 5.5 Detail bukti PANDU

Tampilan pertama menunjukkan:

- `PANDU-QP-2026-000001`
- Badge “Menunggu direkam”, “Terekam”, “Gagal direkam”, atau “Dicabut”
- Batch, bahan, pemasok publik, hasil, tanggal persetujuan
- Tombol utama: **Rekam bukti** atau **Buka halaman verifikasi**
- Status progress singkat: Diminta → Dikirim → Dikonfirmasi

Bagian **Detail teknis** tertutup secara default dan berisi commitment, versi kanonisasi, jaringan, alamat kontrak, dan tautan transaksi. Jelaskan commitment sebagai “sidik jari digital dari ringkasan bukti ini”.

### 5.6 Verifikasi publik

Tampilan harus bekerja baik di ponsel dan tanpa akun/wallet. Urutan:

1. PANDU + judul “Periksa bukti PANDU”
2. Nomor proof
3. Status besar berbentuk ikon + teks
4. Satu kalimat arti status
5. Ringkasan batch dan pemeriksaan yang aman dibagikan
6. Tanggal rekam dan tautan explorer
7. “Cara kerja pemeriksaan” yang dapat dibuka

Contoh `VERIFIED`: **Bukti cocok** — “Ringkasan ini sama dengan bukti yang direkam di blockchain dan belum dicabut.”

Contoh `MISMATCH`: **Bukti berubah** — “Ringkasan yang dibuka berbeda dari bukti yang direkam. Ini menunjukkan perbedaan data, bukan otomatis membuktikan kecurangan atau kondisi fisik barang.”

Contoh `REVOKED`: **Bukti dicabut** — “Bukti ini pernah direkam, tetapi kemudian dicabut. Riwayat rekamannya tetap tersedia.”

Contoh `UNAVAILABLE`: **Belum dapat diperiksa** — “Layanan jaringan belum memberi hasil. Coba lagi beberapa saat.” Hindari status VERIFIED saat RPC/data tidak tersedia.

## 6. Copywriting dan istilah

| Istilah teknis | Teks antarmuka |
|---|---|
| Anchor | Rekam bukti di blockchain |
| Hash / commitment | Sidik jari digital |
| Relayer | Proses pengiriman otomatis (umumnya tidak perlu ditampilkan) |
| On-chain | Terekam di blockchain |
| Revoke | Cabut bukti |
| Pending | Sedang diproses |
| Mismatch | Bukti berubah / tidak cocok |

Istilah teknis lengkap tersedia melalui label “Detail teknis”. Jangan menyebut proof sebagai sertifikat resmi atau jaminan kualitas barang.

## 7. Responsif dan aksesibilitas

- Desktop: sidebar tetap, konten satu kolom utama, tabel ringkas.
- Tablet: sidebar dapat diciutkan; tabel dapat digeser horizontal dengan petunjuk.
- Ponsel: navigasi ringkas; halaman publik ditata satu kolom; metadata penting tetap terbaca.
- Gunakan `prefers-reduced-motion`; semua animasi non-esensial berhenti bila diminta.
- Input punya label; error terkait langsung ke field; status diumumkan ke screen reader.
- Jangan bergantung pada hover. Target sentuh sekitar 44×44 px.
- Kontras teks normal minimal WCAG AA. Status punya teks dan ikon.

## 8. Keadaan yang perlu didesain

Untuk form, daftar, dan proof tangani: memuat, kosong, sukses, gagal, dinonaktifkan, konflik/duplikasi, tidak terhubung, dan pemulihan/retry. Pada anchor, status selalu mengikuti backend: belum direkam → sedang diproses → terekam/gagal. Jangan menampilkan tx hash contoh yang tampak nyata.

## 9. Demo interaktif

`Ringkasan → Batch → Isi pemeriksaan → Kirim ke QA → Setujui → Buat proof → Rekam → Verifikasi publik → Simulasi mismatch/revoke.`

Setiap simulasi non-chain ditandai **SIMULASI**. Demo utama menampilkan transaksi testnet nyata jika jaringan tersedia.

## 10. Kriteria prototipe

- Pengguna awam dapat menjelaskan apa yang dilakukan PANDU setelah melihat layar pertama.
- QC tahu nilai apa yang harus diisi dan bagaimana memperbaiki error.
- QA paham apa yang disetujui sebelum menekan tombol.
- Pembeli memahami hasil verifikasi tanpa belajar hash atau wallet.
- Informasi privat tidak muncul pada halaman publik.
- Warna, tombol, istilah, dan status sama pada desktop dan ponsel.
