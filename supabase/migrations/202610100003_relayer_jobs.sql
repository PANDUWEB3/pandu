-- Idempotent schema-only migration for the backend relayer idempotency journal.
-- Do not run against the primary Supabase project in this phase.
-- Rollback: stop relayer writes, export this table and reconcile every pending transaction
-- against chain receipts before dropping it; never delete an unresolved job record.
begin;

create table if not exists public.relayer_jobs (
  idempotency_key text primary key,
  chain_id bigint not null,
  contract_address text,
  proof_id text not null,
  operation text not null check (operation in ('anchor', 'revoke')),
  state text not null default 'queued' check (state in ('queued', 'submitting', 'pending', 'confirmed', 'failed')),
  nonce bigint,
  tx_hash text,
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.relayer_jobs enable row level security;
revoke all on table public.relayer_jobs from anon, authenticated;
grant select, insert, update on table public.relayer_jobs to service_role;

commit;
