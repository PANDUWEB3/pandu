-- Migration: Drop old file storage and transition to privacy-first Google OAuth
-- Drops evidence files and storage bucket.
-- Updates user tracking to only store Google OAuth sub hashes.

DROP TABLE IF EXISTS public.evidence_files CASCADE;
DROP POLICY IF EXISTS evidence_storage_read_member ON storage.objects;
DROP POLICY IF EXISTS evidence_storage_insert_qc ON storage.objects;
DROP POLICY IF EXISTS evidence_storage_delete_qc ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'quality-evidence';

-- We only store Google OAuth sub hash and wallet mapping.
CREATE TABLE IF NOT EXISTS public.user_google_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_sub_hash bytea not null unique check (octet_length(google_sub_hash) = 32),
  created_at timestamptz not null default now()
);

-- Note: We are keeping public.user_wallets as requested (pemetaan ke wallet).
