# PANDU key management and field classification

## Data classification

Policy for the schema defined in `supabase/migrations/202610090001_multi_tenant_foundation.sql` and `202610100001_privacy_migration.sql`. `*_ciphertext` fields are additive client ciphertext during rollout. Legacy plaintext fields remain until a verified client backfill and a separately reviewed drop migration; do not represent the current database as encrypted at rest by this design.

| Table | Plaintext (exact columns) | Encrypted (exact columns) | Removed/deferred |
|---|---|---|---|
| `profiles` | `user_id`, `created_at`, `updated_at` | `display_name` | — |
| `organizations` | `id`, `industry_key`, `created_by`, `created_at` | `name`, `settings` | — |
| `organization_members` | `organization_id`, `user_id`, `role`, `status`, `joined_at`, `invited_by` | — | No email column; invitation secrets are not keys |
| `user_wallets` | `id`, `user_id`, `chain_namespace`, `chain_id`, `address`, `verified_at`, `created_at` | — | Wallet address stays plaintext for identity/chain lookup |
| `wallet_link_challenges` | `id`, `user_id`, `nonce_hash`, `domain`, `chain_id`, `expires_at`, `consumed_at`, `created_at` | — | Raw nonce is never persisted |
| `quality_profiles` | `id`, `organization_id`, `industry_key`, `version`, `active`, `created_by`, `created_at` | `name`, `rules` | — |
| `suppliers` | `id`, `organization_id`, `external_ref`, `created_at`, `created_by` | `name`, `attributes` | `external_ref` only remains if exact-match use justifies its leakage |
| `materials` | `id`, `organization_id`, `category`, `created_at`, `created_by` | `name`, `attributes` | — |
| `batches` | `id`, `organization_id`, `batch_code`, `supplier_id`, `material_id`, `status`, `created_by`, `created_at` | `attributes` | Batch code is sensitive but retained for current lookup compatibility; public endpoints must not expose it |
| `inspections` | `id`, `organization_id`, `batch_id`, `quality_profile_id`, `status`, `recorded_by`, `reviewer_id`, `submitted_at`, `reviewed_at`, `created_at` | `measurements`, `specification_snapshot`, `result_summary`, `notes` | — |
| `evidence_files` | `id`, `organization_id`, `inspection_id`, `bucket_id`, `object_path`/`cid`, `mime_type`, `byte_size`, `sha256`, `uploaded_by`, `created_at` | `original_name` | Never put original filename in public snapshots |
| `quality_proofs` | `id`, `organization_id`, `inspection_id`, `public_id`, `public_token_hash`, `canonicalization_version`, `commitment`, `chain_id`, `contract_address`, `anchor_status`, `transaction_hash`, `block_number`, `revoked_at`, `created_by`, `created_at` | private snapshot payload | `public_snapshot` is legacy plaintext today; Fase 3 must replace it with approved disclosure metadata and keep legacy rows read-only |
| `audit_events` | `id`, `organization_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `created_at` | `details` | Never duplicate sensitive details in action/entity fields or logs |
| `user_google_accounts` | `id`, `user_id`, `created_at` | — | `google_sub_hash` is HMAC-SHA-256 with backend `GOOGLE_SUB_PEPPER`; raw Google `sub` is not stored |
| `key_envelopes` | `id`, `organization_id`, `recipient_user_id`, `kid`, `envelope_algorithm`, `status`, `created_at` | `envelope` (ciphertext already) | Never store ODK or KEK plaintext |
| `relayer_jobs` | `idempotency_key`, `chain_id`, `contract_address`, `proof_id`, `operation`, `state`, `nonce`, `tx_hash`, `attempts`, `error_code`, `created_at`, `updated_at` | — | Never accept measurement, salt, ODK or plaintext proof fields |

IDs, organization IDs, roles, statuses, lifecycle timestamps, CIDs, cryptographic hashes, MIME/size, chain identifiers and transaction metadata remain plaintext because they are needed for authorization, joins, operational state or public integrity. Their presence leaks relationships, timing and activity; row security and endpoint minimization still apply. Wallet addresses and batch codes are also plaintext for current authentication/lookup compatibility and carry material privacy risk. No blind index is approved for low-cardinality values, names, free text, category, measurements or status. If exact-match server filtering later requires one, use a dedicated 32-byte HMAC key, version it, and document equality/frequency/query leakage before enabling it.

## Client key lifecycle

- The browser generates a random 32-byte ODK for each organization generation (`kid`). The server only stores ciphertext envelopes and never receives the ODK, plaintext business values, measurement values, or field salts.
- Data fields use Web Crypto AES-256-GCM with a fresh random 96-bit IV per encryption and 128-bit tag. Authenticated additional data binds `organization_id`, table, row ID, column, and `kid`. The serialized envelope has `v`, `alg`, `kid`, `iv`, `data`, and `aad`.
- The ODK is wrapped separately for each member and each recovery method. Wallet/passkey KEKs are device-derived; recovery uses PBKDF2-SHA-256 with 600,000 iterations and an independent random salt of at least 16 bytes; recovery passphrases have at least 12 characters. ECDH P-256 invitation envelopes are recipient-specific. Third-party proof access uses a DEK scoped to one proof, never the recovery passphrase or organization ODK.
- Keys live only in session memory and are discarded on logout/session change. Browser storage, URLs, analytics, logs and backend requests must not contain key material. A session may require explicit unlock again after reload.
- Removing a member requires revoke membership/sessions, create a fresh ODK and `kid`, issue envelopes only to active members, switch new writes, then progressively decrypt/re-encrypt old rows in the client and verify each new ciphertext before marking the row complete. Keep old generations only as long as historical rows need them. A former member may retain data already downloaded.
- Dual-write/backfill is client-side, per organization, resumable and verifiable before the separate plaintext-drop migration. No server-side backfill can decrypt rows.

## Migration and operations constraints

`202610100004_client_side_encryption.sql` only adds nullable ciphertext columns and an RLS-protected envelope table. It is a file, not an instruction to run on primary Supabase. The plaintext-drop SQL is deliberately a separate manual artifact and requires a verified backup, explicit `--execute`, interactive confirmation, and a tested restore plan. Do not use service-role reads to decrypt or transform business fields.

The RLS policy on `key_envelopes` limits read/write/delete to the authenticated recipient who is still an organization member. Local SQL tests cover own-member and cross-organization behavior. An organization administrator must not be able to read another member's envelope through the client API.

## Known current implementation gap

The schema and client primitives are additive foundations. Existing workspace read/write routes and proof assembly still have legacy plaintext flows until the Fase 2 client migration and Fase 3 selective-disclosure cutover are complete. Do not use real business data until those flows are fully migrated and independently audited.
