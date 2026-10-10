-- Idempotent schema-only migration. Do not apply to the primary Supabase project in this phase.
-- Rollback: restore the previous four-MIME constraint only after confirming no ciphertext rows
-- were written; otherwise export affected rows and plan a reviewed conversion before rollback.
begin;

alter table public.evidence_files drop constraint if exists evidence_files_mime_type_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.evidence_files'::regclass
      and conname = 'evidence_files_mime_type_check'
  ) then
    alter table public.evidence_files
      add constraint evidence_files_mime_type_check
      check (mime_type in (
        'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'
      ));
  end if;
end $$;

commit;
