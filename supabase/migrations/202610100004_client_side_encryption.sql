-- PANDU Fase 2: additive ciphertext and per-member key envelopes.
-- File-only migration. Never run against the primary Supabase project from automation.
-- Plaintext columns are intentionally retained during client dual-write/backfill.

alter table public.profiles add column if not exists display_name_ciphertext jsonb;
alter table public.organizations add column if not exists name_ciphertext jsonb;
alter table public.organizations add column if not exists settings_ciphertext jsonb;
alter table public.quality_profiles add column if not exists name_ciphertext jsonb;
alter table public.quality_profiles add column if not exists rules_ciphertext jsonb;
alter table public.suppliers add column if not exists name_ciphertext jsonb;
alter table public.suppliers add column if not exists attributes_ciphertext jsonb;
alter table public.materials add column if not exists name_ciphertext jsonb;
alter table public.materials add column if not exists attributes_ciphertext jsonb;
alter table public.batches add column if not exists attributes_ciphertext jsonb;
alter table public.inspections add column if not exists measurements_ciphertext jsonb;
alter table public.inspections add column if not exists specification_snapshot_ciphertext jsonb;
alter table public.inspections add column if not exists result_summary_ciphertext jsonb;
alter table public.inspections add column if not exists notes_ciphertext jsonb;
alter table public.evidence_files add column if not exists original_name_ciphertext jsonb;
alter table public.quality_proofs add column if not exists private_snapshot_ciphertext jsonb;
alter table public.audit_events add column if not exists details_ciphertext jsonb;

create table if not exists public.key_envelopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kid text not null check (length(kid) between 1 and 128),
  envelope jsonb not null,
  envelope_algorithm text not null check (envelope_algorithm in ('A256GCM', 'ECDH-P256+A256GCM')),
  status text not null default 'active' check (status in ('active', 'superseded', 'revoked')),
  created_at timestamptz not null default now(),
  unique (organization_id, recipient_user_id, kid)
);

create index if not exists key_envelopes_recipient_idx on public.key_envelopes(organization_id, recipient_user_id, status);
alter table public.key_envelopes enable row level security;
revoke all on public.key_envelopes from anon;
grant select, insert, update, delete on public.key_envelopes to authenticated;
drop policy if exists key_envelopes_member_own_read on public.key_envelopes;
create policy key_envelopes_member_own_read on public.key_envelopes for select to authenticated
  using (recipient_user_id = (select auth.uid()) and public.is_org_member(organization_id));
drop policy if exists key_envelopes_member_own_insert on public.key_envelopes;
create policy key_envelopes_member_own_insert on public.key_envelopes for insert to authenticated
  with check (recipient_user_id = (select auth.uid()) and public.is_org_member(organization_id));
drop policy if exists key_envelopes_member_own_update on public.key_envelopes;
create policy key_envelopes_member_own_update on public.key_envelopes for update to authenticated
  using (recipient_user_id = (select auth.uid()) and public.is_org_member(organization_id))
  with check (recipient_user_id = (select auth.uid()) and public.is_org_member(organization_id));
drop policy if exists key_envelopes_member_own_delete on public.key_envelopes;
create policy key_envelopes_member_own_delete on public.key_envelopes for delete to authenticated
  using (recipient_user_id = (select auth.uid()) and public.is_org_member(organization_id));

comment on table public.key_envelopes is 'Client-encrypted ODK envelope per active organization member; server cannot decrypt.';
comment on column public.key_envelopes.kid is 'Organization data key generation identifier; rotate on member removal.';
comment on column public.key_envelopes.envelope is 'Ciphertext-only KEK or ECDH wrapped ODK envelope.';

-- Reject malformed envelopes without interpreting/decrypting their payload.
create or replace function public.is_db_ciphertext_envelope(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object'
    and value->>'v' = '1'
    and value->>'alg' = 'A256GCM'
    and length(coalesce(value->>'kid', '')) between 1 and 128
    and length(coalesce(value->>'iv', '')) between 16 and 32
    and length(coalesce(value->>'data', '')) >= 24
    and length(coalesce(value->>'aad', '')) between 2 and 2048
    and (select count(*) = 6 from jsonb_object_keys(value));
$$;

create or replace function public.create_inspection_encrypted(
  p_inspection_id uuid, p_batch_id uuid, p_quality_profile_id uuid, p_specification_envelope jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  batch_org uuid;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.is_db_ciphertext_envelope(p_specification_envelope) then raise exception 'Ciphertext envelope required'; end if;
  select organization_id into batch_org from public.batches where id = p_batch_id;
  if batch_org is null then raise exception 'Batch not found'; end if;
  if not public.has_org_role(batch_org, array['owner', 'admin', 'qc']) then raise exception 'QC role required'; end if;
  if not exists (select 1 from public.quality_profiles where id = p_quality_profile_id and organization_id = batch_org and active) then
    raise exception 'Active quality profile not found';
  end if;
  insert into public.inspections(id, organization_id, batch_id, quality_profile_id, specification_snapshot_ciphertext, recorded_by)
  values (p_inspection_id, batch_org, p_batch_id, p_quality_profile_id, p_specification_envelope, actor_id);
  return p_inspection_id;
end $$;

create or replace function public.save_inspection_encrypted(
  p_inspection_id uuid, p_measurements jsonb, p_specification jsonb, p_result_summary jsonb, p_notes jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  row_data public.inspections%rowtype;
  actor_id uuid := auth.uid();
begin
  if not public.is_db_ciphertext_envelope(p_measurements)
    or not public.is_db_ciphertext_envelope(p_specification)
    or not public.is_db_ciphertext_envelope(p_result_summary)
    or not public.is_db_ciphertext_envelope(p_notes) then raise exception 'Ciphertext envelopes required'; end if;
  select * into row_data from public.inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found'; end if;
  if not public.has_org_role(row_data.organization_id, array['owner', 'admin', 'qc']) then raise exception 'QC role required'; end if;
  if row_data.recorded_by <> actor_id then raise exception 'Only the QC creator can edit this inspection'; end if;
  if row_data.status not in ('draft', 'rejected') then raise exception 'Inspection is not editable'; end if;
  update public.inspections set measurements_ciphertext = p_measurements,
    specification_snapshot_ciphertext = p_specification, result_summary_ciphertext = p_result_summary,
    notes_ciphertext = p_notes where id = p_inspection_id;
end $$;

create or replace function public.submit_inspection_encrypted(p_inspection_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  row_data public.inspections%rowtype;
  actor_id uuid := auth.uid();
begin
  select * into row_data from public.inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found'; end if;
  if not public.has_org_role(row_data.organization_id, array['owner', 'admin', 'qc']) then raise exception 'QC role required'; end if;
  if row_data.recorded_by <> actor_id then raise exception 'Only the QC creator can submit this inspection'; end if;
  if row_data.status not in ('draft', 'rejected') then raise exception 'Inspection cannot be submitted from its current state'; end if;
  if row_data.measurements_ciphertext is null or row_data.specification_snapshot_ciphertext is null
    or row_data.result_summary_ciphertext is null or row_data.notes_ciphertext is null then raise exception 'Encrypted inspection fields required'; end if;
  update public.inspections set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null where id = p_inspection_id;
  insert into public.audit_events(organization_id, actor_id, action, entity_type, entity_id)
  values (row_data.organization_id, actor_id, 'inspection.submitted', 'inspection', p_inspection_id);
end $$;

create or replace function public.review_inspection_encrypted(p_inspection_id uuid, p_decision text, p_notes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  row_data public.inspections%rowtype;
  actor_id uuid := auth.uid();
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  if p_notes is not null and not public.is_db_ciphertext_envelope(p_notes) then raise exception 'Ciphertext envelope required'; end if;
  select * into row_data from public.inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found'; end if;
  if not public.has_org_role(row_data.organization_id, array['admin', 'qa']) then raise exception 'QA role required'; end if;
  if row_data.recorded_by = actor_id then raise exception 'QC creator cannot review their own inspection'; end if;
  if row_data.status <> 'submitted' then raise exception 'Only submitted inspections can be reviewed'; end if;
  update public.inspections set status = p_decision, reviewer_id = actor_id, reviewed_at = now(),
    notes_ciphertext = coalesce(p_notes, notes_ciphertext) where id = p_inspection_id;
  insert into public.audit_events(organization_id, actor_id, action, entity_type, entity_id)
  values (row_data.organization_id, actor_id, 'inspection.' || p_decision, 'inspection', p_inspection_id);
end $$;

revoke all on function public.is_db_ciphertext_envelope(jsonb) from public, anon;
revoke all on function public.create_inspection(uuid, uuid) from authenticated;
revoke all on function public.save_inspection_draft(uuid, jsonb, text) from authenticated;
revoke all on function public.submit_inspection(uuid) from authenticated;
revoke all on function public.review_inspection(uuid, text, text) from authenticated;
grant execute on function public.create_inspection_encrypted(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_inspection_encrypted(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.submit_inspection_encrypted(uuid) to authenticated;
grant execute on function public.review_inspection_encrypted(uuid, text, jsonb) to authenticated;
