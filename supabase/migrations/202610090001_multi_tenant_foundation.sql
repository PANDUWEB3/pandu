-- PANDU multi-tenant schema foundation.
-- Apply only to a Supabase project after reviewing policies for the deployment environment.
-- The current local demo does not use this migration yet.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  industry_key text not null default 'general' check (length(industry_key) between 2 and 80),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'qc', 'qa', 'auditor')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  joined_at timestamptz not null default now(),
  invited_by uuid references auth.users(id),
  primary key (organization_id, user_id)
);

-- Wallets are linked to an already authenticated Gmail/SSO user after SIWE verification.
create table if not exists public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_namespace text not null default 'eip155' check (chain_namespace = 'eip155'),
  chain_id bigint not null check (chain_id > 0),
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (chain_namespace, address)
);

-- Short-lived nonce challenges are written/consumed by the authenticated backend only.
create table if not exists public.wallet_link_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce_hash bytea not null unique check (octet_length(nonce_hash) = 32),
  domain text not null,
  chain_id bigint not null check (chain_id > 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quality_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  industry_key text not null default 'general',
  version integer not null default 1 check (version > 0),
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name, version)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  external_ref text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (organization_id, id),
  unique (organization_id, external_ref)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_code text not null,
  supplier_id uuid,
  material_id uuid,
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'under_review', 'accepted', 'rejected', 'closed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, batch_code),
  foreign key (organization_id, supplier_id) references public.suppliers(organization_id, id),
  foreign key (organization_id, material_id) references public.materials(organization_id, id)
);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null,
  quality_profile_id uuid,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  measurements jsonb not null default '[]'::jsonb,
  specification_snapshot jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  notes text not null default '' check (length(notes) <= 4000),
  recorded_by uuid not null references auth.users(id),
  reviewer_id uuid references auth.users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, batch_id) references public.batches(organization_id, id),
  foreign key (organization_id, quality_profile_id) references public.quality_profiles(organization_id, id),
  check (reviewer_id is null or reviewer_id <> recorded_by)
);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null,
  bucket_id text not null default 'quality-evidence' check (bucket_id = 'quality-evidence'),
  object_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 bytea not null check (octet_length(sha256) = 32),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, inspection_id) references public.inspections(organization_id, id) on delete cascade
);

create table if not exists public.quality_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null,
  public_id text not null unique,
  public_token_hash bytea not null unique check (octet_length(public_token_hash) = 32),
  public_snapshot jsonb not null,
  canonicalization_version integer not null check (canonicalization_version > 0),
  commitment bytea not null check (octet_length(commitment) = 32),
  chain_id bigint not null,
  contract_address text not null,
  anchor_status text not null default 'not_anchored' check (anchor_status in ('not_anchored', 'pending', 'confirmed', 'failed', 'revoked')),
  transaction_hash text,
  block_number bigint,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (inspection_id),
  foreign key (organization_id, inspection_id) references public.inspections(organization_id, id)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_idx on public.organization_members(user_id, status);
create index if not exists user_wallets_user_idx on public.user_wallets(user_id);
create index if not exists wallet_link_challenges_expiry_idx on public.wallet_link_challenges(expires_at) where consumed_at is null;
create index if not exists batches_org_created_idx on public.batches(organization_id, created_at desc);
create index if not exists inspections_org_status_idx on public.inspections(organization_id, status, created_at desc);
create index if not exists inspections_batch_idx on public.inspections(organization_id, batch_id, created_at desc);
create index if not exists evidence_inspection_idx on public.evidence_files(organization_id, inspection_id);
create index if not exists proofs_inspection_idx on public.quality_proofs(organization_id, inspection_id, created_at desc);
create index if not exists audit_events_org_created_idx on public.audit_events(organization_id, created_at desc);

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(p_roles)
  );
$$;

create or replace function public.create_organization(p_name text, p_industry_key text default 'general')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  new_id uuid;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 160 then
    raise exception 'Organization name must contain 2 to 160 characters';
  end if;
  insert into public.organizations(name, industry_key, created_by)
  values (trim(p_name), coalesce(nullif(trim(p_industry_key), ''), 'general'), actor_id)
  returning id into new_id;
  insert into public.organization_members(organization_id, user_id, role, status)
  values (new_id, actor_id, 'owner', 'active');
  return new_id;
end;
$$;

create or replace function public.prevent_tenant_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  if tg_table_name = 'organization_members' then
    if new.user_id is distinct from old.user_id then
      raise exception 'membership user_id is immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger organization_members_no_move before update on public.organization_members for each row execute function public.prevent_tenant_move();
create trigger quality_profiles_no_move before update on public.quality_profiles for each row execute function public.prevent_tenant_move();
create trigger suppliers_no_move before update on public.suppliers for each row execute function public.prevent_tenant_move();
create trigger materials_no_move before update on public.materials for each row execute function public.prevent_tenant_move();
create trigger batches_no_move before update on public.batches for each row execute function public.prevent_tenant_move();
create trigger inspections_no_move before update on public.inspections for each row execute function public.prevent_tenant_move();
create trigger evidence_files_no_move before update on public.evidence_files for each row execute function public.prevent_tenant_move();
create trigger quality_proofs_no_move before update on public.quality_proofs for each row execute function public.prevent_tenant_move();
create trigger audit_events_no_move before update on public.audit_events for each row execute function public.prevent_tenant_move();

create or replace function public.save_inspection_draft(
  p_inspection_id uuid,
  p_measurements jsonb,
  p_notes text default ''
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  inspection_row public.inspections%rowtype;
  actor_id uuid := auth.uid();
begin
  select * into inspection_row from public.inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found'; end if;
  if not public.has_org_role(inspection_row.organization_id, array['owner', 'admin', 'qc']) then raise exception 'QC role required'; end if;
  if inspection_row.recorded_by <> actor_id then raise exception 'Only the QC creator can edit this inspection'; end if;
  if inspection_row.status not in ('draft', 'rejected') then raise exception 'Inspection is not editable'; end if;
  update public.inspections
  set measurements = coalesce(p_measurements, '[]'::jsonb),
      result_summary = '{}'::jsonb,
      notes = left(coalesce(p_notes, ''), 4000)
  where id = p_inspection_id;
end;
$$;

create or replace function public.submit_inspection(p_inspection_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  inspection_row public.inspections%rowtype;
  spec_item jsonb;
  measurement_item jsonb;
  actual_value numeric;
  min_value numeric;
  max_value numeric;
  all_pass boolean := true;
  checks jsonb := '[]'::jsonb;
  actor_id uuid := auth.uid();
begin
  select * into inspection_row from public.inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found'; end if;
  if not public.has_org_role(inspection_row.organization_id, array['owner', 'admin', 'qc']) then raise exception 'QC role required'; end if;
  if inspection_row.recorded_by <> actor_id then raise exception 'Only the QC creator can submit this inspection'; end if;
  if inspection_row.status not in ('draft', 'rejected') then raise exception 'Inspection cannot be submitted from its current state'; end if;
  if jsonb_typeof(inspection_row.specification_snapshot->'measurements') is distinct from 'array'
    or jsonb_array_length(coalesce(inspection_row.specification_snapshot->'measurements', '[]'::jsonb)) = 0 then
    raise exception 'Inspection profile has no measurement rules';
  end if;
  if jsonb_typeof(inspection_row.measurements) is distinct from 'array' then raise exception 'Measurements must be a JSON array'; end if;
  for spec_item in select value from jsonb_array_elements(inspection_row.specification_snapshot->'measurements') loop
    if coalesce(spec_item->>'key', '') = ''
      or jsonb_typeof(spec_item->'min') is distinct from 'number'
      or jsonb_typeof(spec_item->'max') is distinct from 'number'
      or (spec_item->>'min')::numeric > (spec_item->>'max')::numeric then
      raise exception 'Invalid numeric rule in the saved quality profile';
    end if;
    select value into measurement_item from jsonb_array_elements(inspection_row.measurements) as measurements(value)
      where measurements.value->>'key' = spec_item->>'key' limit 1;
    if measurement_item is null or jsonb_typeof(measurement_item->'value') is distinct from 'number' then
      all_pass := false;
      checks := checks || jsonb_build_array(jsonb_build_object('key', spec_item->>'key', 'result', 'MISSING'));
      continue;
    end if;
    actual_value := (measurement_item->>'value')::numeric;
    min_value := (spec_item->>'min')::numeric;
    max_value := (spec_item->>'max')::numeric;
    if actual_value < min_value or actual_value > max_value then all_pass := false; end if;
    checks := checks || jsonb_build_array(jsonb_build_object(
      'key', spec_item->>'key', 'actual', actual_value, 'min', min_value, 'max', max_value,
      'unit', spec_item->>'unit', 'result', case when actual_value between min_value and max_value then 'PASS' else 'FAIL' end
    ));
  end loop;
  update public.inspections set status = 'submitted', submitted_at = now(), reviewer_id = null, reviewed_at = null,
    result_summary = jsonb_build_object('result', case when all_pass then 'PASS' else 'FAIL' end, 'checks', checks)
    where id = p_inspection_id;
  insert into public.audit_events(organization_id, actor_id, action, entity_type, entity_id)
  values (inspection_row.organization_id, actor_id, 'inspection.submitted', 'inspection', p_inspection_id);
end;
$$;

create or replace function public.create_inspection(p_batch_id uuid, p_quality_profile_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  batch_row public.batches%rowtype;
  profile_row public.quality_profiles%rowtype;
  actor_id uuid := auth.uid();
  new_inspection_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select * into batch_row from public.batches where id = p_batch_id;
  if not found then raise exception 'Batch not found'; end if;
  if not public.has_org_role(batch_row.organization_id, array['owner', 'admin', 'qc']) then raise exception 'QC role required'; end if;
  select * into profile_row from public.quality_profiles
    where id = p_quality_profile_id and organization_id = batch_row.organization_id and active;
  if not found then raise exception 'Active quality profile not found'; end if;
  insert into public.inspections(organization_id, batch_id, quality_profile_id, specification_snapshot, recorded_by)
  values (batch_row.organization_id, batch_row.id, profile_row.id, profile_row.rules, actor_id)
  returning id into new_inspection_id;
  return new_inspection_id;
end;
$$;

create or replace function public.review_inspection(p_inspection_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  inspection_row public.inspections%rowtype;
  actor_id uuid := auth.uid();
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into inspection_row from public.inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found'; end if;
  if not public.has_org_role(inspection_row.organization_id, array['admin', 'qa']) then raise exception 'QA role required'; end if;
  if inspection_row.recorded_by = actor_id then raise exception 'QC creator cannot review their own inspection'; end if;
  if inspection_row.status <> 'submitted' then raise exception 'Only submitted inspections can be reviewed'; end if;
  if p_decision = 'approved' and coalesce(inspection_row.result_summary->>'result', '') <> 'PASS' then
    raise exception 'Only a passing inspection can be approved';
  end if;
  update public.inspections
  set status = p_decision, reviewer_id = actor_id, reviewed_at = now(),
      notes = case when p_notes is null then notes else left(p_notes, 4000) end
  where id = p_inspection_id;
  insert into public.audit_events(organization_id, actor_id, action, entity_type, entity_id, details)
  values (inspection_row.organization_id, actor_id, 'inspection.' || p_decision, 'inspection', p_inspection_id, jsonb_build_object('previous_status', inspection_row.status));
end;
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, text[]) from public, anon;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
revoke all on function public.prevent_tenant_move() from public, anon, authenticated;
revoke all on function public.save_inspection_draft(uuid, jsonb, text) from public, anon;
revoke all on function public.create_inspection(uuid, uuid) from public, anon;
revoke all on function public.submit_inspection(uuid) from public, anon;
revoke all on function public.review_inspection(uuid, text, text) from public, anon;
grant execute on function public.save_inspection_draft(uuid, jsonb, text) to authenticated;
grant execute on function public.create_inspection(uuid, uuid) to authenticated;
grant execute on function public.submit_inspection(uuid) to authenticated;
grant execute on function public.review_inspection(uuid, text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.user_wallets enable row level security;
alter table public.wallet_link_challenges enable row level security;
alter table public.quality_profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.materials enable row level security;
alter table public.batches enable row level security;
alter table public.inspections enable row level security;
alter table public.evidence_files enable row level security;
alter table public.quality_proofs enable row level security;
alter table public.audit_events enable row level security;

grant select, insert, update, delete on public.profiles, public.organizations, public.organization_members,
  public.quality_profiles, public.suppliers, public.materials, public.batches, public.inspections,
  public.evidence_files, public.quality_proofs, public.audit_events to authenticated;
grant select, delete on public.user_wallets to authenticated;
revoke all on public.profiles, public.organizations, public.organization_members,
  public.quality_profiles, public.suppliers, public.materials, public.batches, public.inspections,
  public.evidence_files, public.quality_proofs, public.audit_events from anon;
revoke all on public.user_wallets, public.wallet_link_challenges from anon, authenticated;
grant select, delete on public.user_wallets to authenticated;
grant usage, select on sequence public.audit_events_id_seq to service_role;

create policy profile_read_self on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profile_insert_self on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy profile_update_self on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy organization_read_member on public.organizations for select to authenticated using (public.is_org_member(id));
create policy organization_update_admin on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin'])) with check (public.has_org_role(id, array['owner', 'admin']));

create policy membership_read_self_or_admin on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or public.has_org_role(organization_id, array['owner', 'admin']));
create policy membership_insert_admin on public.organization_members for insert to authenticated
  with check (role <> 'owner' and public.has_org_role(organization_id, array['owner', 'admin']));
create policy membership_update_admin on public.organization_members for update to authenticated
  using (role <> 'owner' and public.has_org_role(organization_id, array['owner', 'admin']))
  with check (role <> 'owner' and public.has_org_role(organization_id, array['owner', 'admin']));
create policy membership_delete_admin on public.organization_members for delete to authenticated
  using (role <> 'owner' and public.has_org_role(organization_id, array['owner', 'admin']));

create policy user_wallets_read_self on public.user_wallets for select to authenticated using (user_id = (select auth.uid()));
create policy user_wallets_delete_self on public.user_wallets for delete to authenticated using (user_id = (select auth.uid()));
-- No authenticated INSERT/UPDATE policy. The API inserts a wallet only after it verifies the SIWE challenge.
-- wallet_link_challenges has no client grants or policies; the backend handles nonce creation and atomic consumption.

create policy profile_templates_read_member on public.quality_profiles for select to authenticated using (public.is_org_member(organization_id));
create policy profile_templates_insert_admin on public.quality_profiles for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin']));
create policy profile_templates_update_admin on public.quality_profiles for update to authenticated using (public.has_org_role(organization_id, array['owner', 'admin'])) with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy suppliers_read_member on public.suppliers for select to authenticated using (public.is_org_member(organization_id));
create policy suppliers_insert_qc on public.suppliers for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin', 'qc']));
create policy suppliers_update_qc on public.suppliers for update to authenticated using (public.has_org_role(organization_id, array['owner', 'admin', 'qc'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'qc']));
create policy suppliers_delete_admin on public.suppliers for delete to authenticated using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy materials_read_member on public.materials for select to authenticated using (public.is_org_member(organization_id));
create policy materials_insert_qc on public.materials for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin', 'qc']));
create policy materials_update_qc on public.materials for update to authenticated using (public.has_org_role(organization_id, array['owner', 'admin', 'qc'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'qc']));
create policy materials_delete_admin on public.materials for delete to authenticated using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy batches_read_member on public.batches for select to authenticated using (public.is_org_member(organization_id));
create policy batches_insert_qc on public.batches for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin', 'qc']) and created_by = (select auth.uid()));
create policy batches_update_qc on public.batches for update to authenticated using (public.has_org_role(organization_id, array['owner', 'admin', 'qc'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'qc']));
create policy batches_delete_admin on public.batches for delete to authenticated using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy inspections_read_member on public.inspections for select to authenticated using (public.is_org_member(organization_id));
-- Inspection creation/edit/submission/review use the scoped RPCs above; clients have no direct INSERT/UPDATE/DELETE grant.

create policy evidence_read_member on public.evidence_files for select to authenticated using (public.is_org_member(organization_id));
create policy evidence_insert_qc on public.evidence_files for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin', 'qc']) and uploaded_by = (select auth.uid()));
create policy evidence_delete_qc on public.evidence_files for delete to authenticated using (public.has_org_role(organization_id, array['owner', 'admin', 'qc']));

create policy proofs_read_member on public.quality_proofs for select to authenticated using (public.is_org_member(organization_id));
-- Proof rows and state changes are performed by trusted backend workflows, not direct browser requests.

revoke insert, update, delete on public.inspections from authenticated;
revoke update on public.evidence_files from authenticated;
revoke insert, update, delete on public.quality_proofs from authenticated;
revoke insert, update, delete on public.audit_events from authenticated;
grant all on public.wallet_link_challenges, public.user_wallets to service_role;
grant all on public.evidence_files, public.quality_proofs, public.audit_events to service_role;
grant select, insert, delete on public.evidence_files to authenticated;

create policy audit_read_admin_auditor on public.audit_events for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'auditor']));
-- No client INSERT/UPDATE/DELETE policy: audit events are written by trusted server workflows.

-- Create a private Storage bucket named `quality-evidence` in the Supabase dashboard/API.
-- Object path format: {organization_uuid}/{batch_uuid}/{random_file_uuid}.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('quality-evidence', 'quality-evidence', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy evidence_storage_read_member on storage.objects for select to authenticated
  using (bucket_id = 'quality-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy evidence_storage_insert_qc on storage.objects for insert to authenticated
  with check (bucket_id = 'quality-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'qc']));
create policy evidence_storage_delete_qc on storage.objects for delete to authenticated
  using (bucket_id = 'quality-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'qc']));
