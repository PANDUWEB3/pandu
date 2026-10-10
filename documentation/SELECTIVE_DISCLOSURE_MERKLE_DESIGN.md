# Desain Merkle Selective Disclosure PANDU v2

## Format kanonikal

`pandu-merkle-v1` memakai SHA-256. Leaf disortir menurut byte UTF-8 path secara leksikografis, bukan urutan unit kode UTF-16. Path harus UTF-8 valid, tidak kosong, unik, dan salt harus tepat 32 byte acak. Objek JSON menyortir key menurut byte UTF-8; array mempertahankan urutan; string/boolean/null mengikuti JSON; angka hanya integer aman. Pengukuran fixed-point diserialisasi sebagai string desimal agar lintas bahasa tidak mengalami pembulatan.

Preimage leaf adalah `0x00 || UTF8(canonicalJson({path, salt, value}))`; node adalah `0x01 || leftHash || rightHash`. Posisi kiri/kanan berasal dari urutan path dan tidak diurutkan ulang. Bila level memiliki node ganjil, node terakhir dipromosikan tanpa hashing ulang dan tanpa sibling. Ini sesuai bentuk rekursif RFC 6962 §2.1 (split pada pangkat dua terbesar yang lebih kecil dari jumlah leaf).

## Kerahasiaan dan selective disclosure

Penerbit membuat salt independen untuk setiap field dan menyimpan path, nilai serta salt hanya dalam envelope proof terenkripsi yang dikuasai klien. Snapshot publik hanya memuat format, path yang dibuka (bukan nilainya), root dan metadata publik yang diperlukan. Salt tidak pernah disimpan di snapshot. Untuk membuka satu field, klien membagikan nilai, salt dan audit path. Paket disclosure dapat berada pada URL fragment (`#d=`), yang tidak dikirim dalam request HTTP; tetap perlakukan tautan tersebut sebagai data sensitif.

Root saja tidak membuktikan kelengkapan klaim. Aplikasi/verifikator harus menetapkan path wajib dan memeriksa commitment root langsung dari chain. Frontend menghitung ulang root sebelum penerbit menandatangani. Tenggat signature maksimal 15 menit.

## Penyimpangan dari RFC 6962

RFC 6962 mendefinisikan log append-only, bukan snapshot selektif PANDU. PANDU menggunakan record bisnis sebagai leaf, menambahkan path dan salt acak, mengurutkan leaf menurut byte UTF-8, dan menggunakan root sebagai commitment proof tunggal. Struktur hash dan promosi node ganjil mengikuti bentuk RFC, tetapi format ini bukan log transparency, tidak menyediakan consistency proof ant versi, dan tidak memberi jaminan append-only. Versi format memisahkan root ini dari legacy `SHA-256(canonicalJson(snapshot))`.

## Implementasi dan vektor

TypeScript frontend dan Node backend mengimplementasikan format sama. Vektor bersama terdapat di `test-vectors/merkle-selective-disclosure-vectors.json` dan `test-vectors/merkle-portability-vectors.json`; vektor portabilitas mencakup urutan UTF-8 yang berbeda dari UTF-16 dan angka fixed-point. Fase 5 menambahkan pembaca Rust terhadap byte-vector yang sama. Test memeriksa preimage, leaf hash, root, orientasi sibling, ganjil, duplikasi path, encoding salt, angka, dan disclosure yang dimodifikasi.
