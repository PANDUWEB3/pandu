-- MANUAL CUTOVER ONLY. Do not apply through automatic migrations.
-- First run backend/scripts/danger/drop-legacy-plaintext.mjs against a test DB.
-- This intentionally destructive migration must be preceded by verified client
-- backfill and backup. Rollback means restore to a fresh DB from that backup.
do $$
declare
  uncovered bigint;
begin
  select
    (select count(*) from public.profiles where display_name is not null and display_name_ciphertext is null) +
    (select count(*) from public.organizations where name_ciphertext is null or settings_ciphertext is null) +
    (select count(*) from public.quality_profiles where name_ciphertext is null or rules_ciphertext is null) +
    (select count(*) from public.suppliers where name_ciphertext is null or attributes_ciphertext is null) +
    (select count(*) from public.materials where name_ciphertext is null or attributes_ciphertext is null) +
    (select count(*) from public.batches where attributes_ciphertext is null) +
    (select count(*) from public.inspections where measurements_ciphertext is null or specification_snapshot_ciphertext is null or result_summary_ciphertext is null or notes_ciphertext is null) +
    (select count(*) from public.evidence_files where original_name_ciphertext is null) +
    (select count(*) from public.quality_proofs where private_snapshot_ciphertext is null) +
    (select count(*) from public.audit_events where details_ciphertext is null)
  into uncovered;
  if uncovered <> 0 then raise exception 'Plaintext cutover blocked: % rows lack ciphertext', uncovered; end if;
end $$;

alter table public.profiles drop column if exists display_name;
alter table public.organizations drop constraint if exists organizations_name_check;
alter table public.organizations drop column if exists name, drop column if exists settings;
alter table public.quality_profiles drop constraint if exists quality_profiles_organization_id_name_version_key;
alter table public.quality_profiles drop column if exists name, drop column if exists rules;
alter table public.suppliers drop column if exists name, drop column if exists attributes;
alter table public.materials drop constraint if exists materials_organization_id_name_key;
alter table public.materials drop column if exists name, drop column if exists attributes;
alter table public.batches drop column if exists attributes;
alter table public.inspections drop column if exists measurements, drop column if exists specification_snapshot, drop column if exists result_summary, drop column if exists notes;
alter table public.evidence_files drop column if exists original_name;
alter table public.quality_proofs drop column if exists private_snapshot;
alter table public.audit_events drop column if exists details;
