/**
 * Rollback: retain the verified pre-run backup outside this process. Restore deleted objects
 * from that backup and verify each object's bytes/CID before exposing the bucket again.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { guardDangerScript } from './guard.mjs';

if (!await guardDangerScript({ scriptName: 'migrate-cleanup-storage', kind: 'supabase', destructive: true })) process.exit(process.exitCode || 0);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY are required in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const isExecute = process.argv.includes('--execute');

async function main() {
  console.log(`=== SUPABASE STORAGE CLEANUP MIGRATION ===`);
  console.log(`Mode: ${isExecute ? 'EXECUTE (REAL DELETION WITH BACKUP)' : 'DRY-RUN (Simulasi, tidak mengubah/menghapus file)'}\n`);

  // 1. Cek keberadaan bucket
  const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
  if (bucketsErr) {
    console.error('Gagal mengambil daftar bucket:', bucketsErr.message);
    process.exit(1);
  }

  const targetBucket = buckets.find(b => b.id === 'quality-evidence');
  if (!targetBucket) {
    console.log('Bucket "quality-evidence" tidak ditemukan atau sudah dibersihkan.');
    return;
  }

  console.log(`Bucket "quality-evidence" ditemukan. Memindai berkas...`);

  // 2. Daftar seluruh berkas
  const { data: files, error: filesErr } = await supabase.storage.from('quality-evidence').list();
  if (filesErr) {
    console.error('Gagal memindai berkas di bucket:', filesErr.message);
    process.exit(1);
  }

  console.log(`Ditemukan ${files.length} berkas/objek pada root bucket "quality-evidence".`);
  for (const f of files) {
    console.log(` - ${f.name} (${f.metadata?.size || 'unknown'} bytes, created: ${f.created_at})`);
  }

  if (!isExecute) {
    console.log('\n[DRY RUN SELESAI] Tidak ada berkas yang diubah atau dihapus.');
    console.log('Untuk mengeksekusi migrasi nyata (dengan backup lokal otomatis & konfirmasi interaktif):');
    console.log('Jalankan: node scripts/migrate-cleanup-storage.mjs --execute\n');
    return;
  }

  // 3. Konfirmasi interaktif wajib
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nPERINGATAN: Operasi ini akan mencadangkan (backup) berkas lalu menghapusnya secara permanen dari Supabase Storage.');
    const answer = await rl.question('Ketik "HAPUS" untuk melanjutkan, atau teks lain untuk membatalkan: ');
    if (answer.trim() !== 'HAPUS') {
      console.log('Operasi dibatalkan oleh pengguna.');
      return;
    }
  } finally {
    rl.close();
  }

  // 4. Langkah Backup sebelum penghapusan
  if (files.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.resolve(process.cwd(), 'data', 'backups', `storage-backup-${timestamp}`);
    await mkdir(backupDir, { recursive: true });
    console.log(`\n[LANGKAH BACKUP] Mengunduh ${files.length} berkas ke direktori lokal: ${backupDir}...`);

    for (const f of files) {
      console.log(` - Mengunduh ${f.name}...`);
      const { data: blob, error: dlErr } = await supabase.storage.from('quality-evidence').download(f.name);
      if (dlErr) {
        console.error(`Gagal mencadangkan berkas ${f.name}:`, dlErr.message);
        console.error('Proses penghapusan DIBATALKAN untuk mencegah kehilangan data.');
        process.exit(1);
      }
      const arrayBuffer = await blob.arrayBuffer();
      const filePath = path.join(backupDir, f.name);
      await writeFile(filePath, Buffer.from(arrayBuffer));
    }
    console.log(`Semua berkas berhasil dicadangkan ke ${backupDir}`);

    // 5. Penghapusan berkas
    const fileNames = files.map(f => f.name);
    console.log(`\n[LANGKAH PENGHAPUSAN] Menghapus ${fileNames.length} berkas dari Supabase Storage...`);
    const { data: delData, error: delErr } = await supabase.storage.from('quality-evidence').remove(fileNames);
    if (delErr) {
      console.error('Gagal menghapus berkas:', delErr.message);
      process.exit(1);
    }
    console.log('Berkas berhasil dihapus:', delData);
  }

  // 6. Hapus bucket
  console.log('Menghapus bucket "quality-evidence"...');
  const { error: emptyErr } = await supabase.storage.deleteBucket('quality-evidence');
  if (emptyErr) {
    console.error('Gagal menghapus bucket:', emptyErr.message);
    process.exit(1);
  }
  console.log('Bucket "quality-evidence" berhasil dihapus.');
  console.log('=== SELESAI ===');
}

main().catch(err => {
  console.error('Terjadi kesalahan:', err);
  process.exit(1);
});
