import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

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
  console.log(`Mode: ${isExecute ? 'EXECUTE (REAL DELETION)' : 'DRY-RUN (Simulasi, tidak menghapus file)'}\n`);

  // 1. Check if bucket exists
  const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
  if (bucketsErr) {
    console.error('Gagal mengambil daftar bucket:', bucketsErr.message);
    process.exit(1);
  }

  const targetBucket = buckets.find(b => b.id === 'quality-evidence');
  if (!targetBucket) {
    console.log('Bucket "quality-evidence" tidak ditemukan atau sudah dihapus.');
    return;
  }

  console.log(`Bucket "quality-evidence" ditemukan. Memindai berkas...`);

  // 2. List all files in the bucket
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
    console.log('\n[DRY RUN SELESAI] Tidak ada berkas yang dihapus.');
    console.log('Untuk mengeksekusi penghapusan nyata, jalankan: node scripts/migrate-cleanup-storage.mjs --execute');
    return;
  }

  // Real deletion execution
  if (files.length > 0) {
    const fileNames = files.map(f => f.name);
    console.log(`\nMenghapus ${fileNames.length} berkas...`);
    const { data: delData, error: delErr } = await supabase.storage.from('quality-evidence').remove(fileNames);
    if (delErr) {
      console.error('Gagal menghapus berkas:', delErr.message);
      process.exit(1);
    }
    console.log('Berkas berhasil dihapus:', delData);
  }

  // Delete bucket
  console.log('Menghapus bucket "quality-evidence"...');
  const { error: emptyErr } = await supabase.storage.deleteBucket('quality-evidence');
  if (emptyErr) {
    console.error('Gagal menghapus bucket:', emptyErr.message);
    process.exit(1);
  }
  console.log('Bucket "quality-evidence" berhasil dihapus.');
}

main().catch(err => {
  console.error('Terjadi kesalahan:', err);
  process.exit(1);
});
