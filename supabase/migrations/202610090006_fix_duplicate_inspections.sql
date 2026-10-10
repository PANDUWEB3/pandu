-- Perbaikan duplikasi inspeksi pada batch yang sama.
-- Gejala: klik "Buat inspeksi" berulang pada batch yang sama membuat banyak
-- draft duplikat di halaman Pemeriksaan, karena create_inspection sebelumnya
-- selalu INSERT baru tanpa memeriksa inspeksi yang sudah terbuka.

-- 1) Bersihkan duplikat yang sudah terlanjur ada.
--    Pertahankan inspeksi terbuka (status <> 'approved') terbaru per batch.
--    Baris evidence_files ikut terhapus otomatis (FK on delete cascade).
with ranked as (
  select id,
         row_number() over (
           partition by batch_id
           order by created_at desc, id desc
         ) as rn
  from public.inspections
  where status <> 'approved'
)
delete from public.inspections
where id in (select id from ranked where rn > 1);

-- 2) Jaminan di level database: satu inspeksi terbuka per batch.
create unique index if not exists inspections_one_open_per_batch
  on public.inspections (batch_id)
  where status <> 'approved';

-- 3) create_inspection menjadi idempotent: jika batch sudah punya inspeksi
--    terbuka (draft/submitted/rejected), kembalikan inspeksi tersebut
--    alih-alih membuat draft baru.
create or replace function public.create_inspection(p_batch_id uuid, p_quality_profile_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  batch_row public.batches%rowtype;
  profile_row public.quality_profiles%rowtype;
  actor_id uuid := auth.uid();
  existing_id uuid;
  new_inspection_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select * into batch_row from public.batches where id = p_batch_id for update;
  if not found then raise exception 'Batch not found'; end if;
  if not public.has_org_role(batch_row.organization_id, array['owner', 'admin', 'qc']) then raise exception 'QC role required'; end if;
  select id into existing_id from public.inspections
    where batch_id = batch_row.id and status <> 'approved'
    order by created_at desc
    limit 1;
  if found then return existing_id; end if;
  select * into profile_row from public.quality_profiles
    where id = p_quality_profile_id and organization_id = batch_row.organization_id and active;
  if not found then raise exception 'Active quality profile not found'; end if;
  insert into public.inspections(organization_id, batch_id, quality_profile_id, specification_snapshot, recorded_by)
  values (batch_row.organization_id, batch_row.id, profile_row.id, profile_row.rules, actor_id)
  returning id into new_inspection_id;
  return new_inspection_id;
end;
$$;
