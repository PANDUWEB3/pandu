# Custody kunci dan batas pencarian PANDU

Dokumen operasional untuk rancangan enkripsi; tidak mengubah database. Jangan menaruh rahasia kunci di database, log, tiket, atau chat.

## Pemegang dan lokasi

| Rahasia | Pemegang | Penyimpanan dan penggunaan |
|---|---|---|
| ODK (organization data key) | Organisasi sebagai pemilik; custodian kunci yang ditunjuk menjaga recovery escrow. Aplikasi anggota hanya menerima material saat sesi berwenang. | Dibuat acak per organisasi. Bungkus ODK untuk custodian/anggota berwenang; simpan ciphertext envelope dan versi/kid di penyimpanan privat. Jangan simpan plaintext ODK di backend atau browser storage persisten. |
| Search pepper | Security/key custodian terpisah dari operator DB | Secret manager/KMS, hanya layanan indeks yang memerlukan akses. Gunakan HMAC untuk blind index; rotasi dengan versi pepper. Jangan kirim ke klien. |
| KEK recovery | Pengguna pemilik recovery passphrase; organisasi tidak memegang passphrase | Diturunkan lokal dengan PBKDF2-SHA256 600.000 iterasi atau lebih dan salt acak; KEK tidak disimpan. Passphrase hanya membuka envelope pemilik, tidak diberikan ke auditor/verifikator. |
| KEK wallet/passkey | Pemilik kredensial wallet/passkey | Diturunkan/dihasilkan di perangkat untuk membuka envelope. Kunci privat wallet/passkey tidak diekspor oleh PANDU. |

## Anggota organisasi dan keluar

Anggota baru mendapat envelope ODK untuk kunci publik perangkat/anggota setelah undangan diterima dan peran disetujui. Berikan hak minimum, catat pemberian/pencabutan di audit log, lindungi kunci privat perangkat dengan OS/keychain, dan jangan mengirim ODK plaintext lewat email/chat. Untuk re-key saat anggota keluar: cabut sesi dan membership terlebih dahulu; buat ODK generasi baru; bungkus ulang untuk seluruh anggota aktif; alihkan penulisan dan pembacaan baru ke generasi baru; re-enkripsi data lama bila kerahasiaan historis dari mantan anggota diwajibkan; lalu hapus envelope dan cache generasi lama yang dapat dicabut. Data yang sudah pernah diunduh atau dibuka mantan anggota tidak dapat ditarik kembali.

Backup ODK dienkripsi, diuji pemulihannya berkala, dan memerlukan dua custodian untuk membuka escrow. Rotasi search pepper harus membangun ulang indeks secara bertahap dengan versi baru sebelum pepper lama dihapus.

## Blind index dan risiko

Batasi blind index ke nilai exact-match yang benar-benar dipakai filter database: kode batch, external reference pemasok, serta kategori/material hanya bila query server membutuhkannya. Jangan indeks nama, teks bebas, catatan inspeksi, hasil pengukuran, isi dokumen, atau setiap kolom secara menyeluruh. Normalisasi deterministik harus berversi dan HMAC memakai search pepper.

Blind index tetap membocorkan kesamaan nilai, frekuensi, dan pola query; nilai domain kecil dapat ditebak jika pepper bocor. Query prefix, substring, dan rentang tidak didukung tanpa kebocoran tambahan. Jangan menganggap blind index sebagai enkripsi atau anonimisasi.
