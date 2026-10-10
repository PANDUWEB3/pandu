# Desain Merkle Selective Disclosure PANDU v2

Dokumen desain format proof; tidak mengubah database atau kontrak yang sedang dipakai. Root Merkle menggantikan canonical JSON hash hanya setelah versi proof dan jalur migrasi disepakati.

## Hash dan urutan

Leaf disortir berdasarkan `path` UTF-8 leksikografis dan path harus unik. Preimage leaf adalah `0x00 || UTF8(canonicalJson({path, salt, value}))`; hash node adalah `0x01 || leftHash || rightHash`. Prefix byte memisahkan domain leaf dari node. Child tidak diurutkan ulang: posisi kiri/kanan berasal dari urutan path.

Untuk setiap level, pasangan berurutan digabungkan. Bila jumlah node ganjil, node terakhir dipromosikan tanpa hashing ulang dan tanpa sibling. Ini sama dengan definisi rekursif RFC 6962 §2.1 (split pada pangkat dua terbesar yang lebih kecil dari jumlah leaf). Audit path harus merekam sisi sibling; promosi ganjil tidak menambahkan langkah.

## Salt leaf

Setiap leaf memakai salt acak independen 32 byte. Seluruh daftar salt beserta path/value disimpan di envelope terenkripsi yang dikuasai penerbit (DEK organisasi/proof); backup mengikuti prosedur key custody. Salt yang diperlukan untuk leaf yang dibuka diberikan kepada verifier bersama value dan audit path. Salt leaf tertutup dan envelope tidak pernah dikirim. Salt bukan rahasia setelah leaf dibuka, tetapi kerahasiaan sebelum disclosure mencegah tebakan nilai berentropi rendah.

## Penyimpangan dari RFC 6962

RFC 6962 mendefinisikan log append-only, bukan format proof PANDU untuk snapshot terurut. PANDU memakai record bisnis kanonikal sebagai leaf, menambah `path` dan salt acak, mengurutkan berdasarkan path, dan menggunakan root sebagai commitment proof tunggal. Struktur hash, prefix `0x00/0x01`, orientasi anak, dan promosi node ganjil mengikuti konstruksi Merkle RFC 6962; ini bukan log transparency RFC, tidak memberikan consistency proof antarversi, dan tidak mewarisi jaminan append-only. Versi format wajib disertakan agar root legacy `SHA-256(canonicalJson(snapshot))` tidak tertukar.

## Verifikasi dan test vectors

Verifier menghitung leaf yang dibuka, menelusuri audit path, lalu membandingkan root terhadap commitment on-chain. Root saja tidak membuktikan kelengkapan klaim; aplikasi harus menentukan path wajib atau klaim yang dapat dibuka.

Test Merkle menguji pemisahan prefix, root untuk jumlah leaf ganjil, audit path setiap posisi, dan perubahan salt/value. Vector lintas bahasa harus mencantumkan path/value/salt, preimage dan hash leaf, arah sibling, serta root.
