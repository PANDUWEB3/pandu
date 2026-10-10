-- ============================================================
-- PANDU — Migration Bundle
-- Jalankan script ini di Supabase SQL Editor jika:
--   • Halaman "Anggota tim" menampilkan pesan
--     "Jalankan migration workspace PANDU terbaru sebelum mengirim undangan."
--   • Halaman "Pemeriksaan" menampilkan error
--     "record new has no field user_id"
--
-- Script ini IDEMPOTENT — aman dijalankan berulang kali.
-- ============================================================

-- ── BAGIAN 1: accept_organization_invites (migration 002) ────────────────────
-- Dibutuhkan agar undangan anggota dapat diterima saat user pertama login.

create or replace function public.accept_organization_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  accepted_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  with accepted as (
    update public.organization_members
    set status = 'active'
    where user_id = actor_id and status = 'invited'
    returning organization_id
  )
  insert into public.audit_events(organization_id, actor_id, action, entity_type, details)
  select organization_id, actor_id, 'organization.invite_accepted', 'organization_member', '{}'::jsonb
  from accepted;

  get diagnostics accepted_count = row_count;
  return accepted_count;
end;
$$;

revoke all on function public.accept_organization_invites() from public, anon;
grant execute on function public.accept_organization_invites() to authenticated, service_role;


-- ── BAGIAN 2: Fix trigger prevent_tenant_move (migration 004) ─────────────────
-- Memperbaiki error "record new has no field user_id" saat menyimpan inspeksi.
--
-- PENYEBAB: Fungsi prevent_tenant_move() mereferensikan NEW.user_id untuk
-- semua tabel, padahal hanya organization_members yang punya kolom itu.
-- PostgreSQL PL/pgSQL me-resolve field di compile-time, bukan runtime,
-- sehingga UPDATE di tabel lain (inspections, batches, dll.) selalu gagal.
--
-- SOLUSI: Pisahkan menjadi dua fungsi — satu generik, satu khusus org_members.

-- Fungsi generik: hanya cek organization_id (untuk semua tabel)
create or replace function public.prevent_tenant_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  return new;
end;
$$;

-- Fungsi khusus organization_members: juga cek user_id
create or replace function public.prevent_membership_id_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'membership user_id is immutable';
  end if;
  return new;
end;
$$;

-- Ganti trigger organization_members ke fungsi yang benar
-- (DROP IF EXISTS memastikan script aman dijalankan ulang)
drop trigger if exists organization_members_no_move on public.organization_members;

create trigger organization_members_no_move
  before update on public.organization_members
  for each row execute function public.prevent_membership_id_move();

revoke all on function public.prevent_membership_id_move() from public, anon, authenticated;


-- ── VERIFIKASI (jalankan setelah script di atas berhasil) ────────────────────
-- SELECT pg_get_triggerdef(t.oid)
-- FROM   pg_trigger AS t
-- WHERE  t.tgname = 'organization_members_no_move'
--   AND  t.tgrelid = 'public.organization_members'::regclass
--   AND  NOT t.tgisinternal;
--
-- Hasil yang diharapkan berisi: EXECUTE FUNCTION public.prevent_membership_id_move()
