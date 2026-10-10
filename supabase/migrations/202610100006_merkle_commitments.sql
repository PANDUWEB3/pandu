-- Fase 3: new proof records commit to a client-computed Merkle root.
-- Only hashes and encrypted issuer material are sent to the backend.
alter table public.quality_proofs add column if not exists batch_ref_hash bytea;
alter table public.quality_proofs add column if not exists merkle_version text;
alter table public.quality_proofs add column if not exists disclosed_paths text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'quality_proofs_batch_ref_hash_length' and conrelid = 'public.quality_proofs'::regclass) then
    alter table public.quality_proofs add constraint quality_proofs_batch_ref_hash_length check (batch_ref_hash is null or octet_length(batch_ref_hash) = 32);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quality_proofs_merkle_version_supported' and conrelid = 'public.quality_proofs'::regclass) then
    alter table public.quality_proofs add constraint quality_proofs_merkle_version_supported check (merkle_version is null or merkle_version = 'pandu-merkle-v1');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quality_proofs_disclosed_paths_bounded' and conrelid = 'public.quality_proofs'::regclass) then
    alter table public.quality_proofs add constraint quality_proofs_disclosed_paths_bounded check (cardinality(disclosed_paths) <= 128);
  end if;
end $$;

comment on column public.quality_proofs.commitment is 'For merkle_version pandu-merkle-v1, SHA-256 Merkle root computed entirely by issuer client.';
comment on column public.quality_proofs.batch_ref_hash is 'bytes32 batch reference commitment; raw batch code is never returned by the proof API.';
comment on column public.quality_proofs.disclosed_paths is 'Path names only. Leaf values and salts are shared in issuer-created disclosure fragments, never submitted to backend.';
comment on column public.quality_proofs.private_snapshot_ciphertext is 'Issuer-only encrypted Merkle leaves and salts; backend treats this as opaque ciphertext.';
