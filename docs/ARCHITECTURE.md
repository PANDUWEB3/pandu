# PANDU application architecture

## Repository boundary

The application repository at `C:\MUTU` and the nested `smart-contract/` directory are independent Git repositories. They have separate commit histories and CI workflows. The root repository ignores `smart-contract/`; changes to contract CI or contract documentation must be committed from inside that directory.

## Backend modules

`backend/src/server.js` remains the composition root and contains the organization and proof business handlers. Startup configuration and cross-cutting concerns are split into modules:

| Module | Responsibility |
|---|---|
| `config/runtime.js` | Zod parsing at boot; production requirements; public CORS origin allowlist validation. Error output names fields only and never echoes environment values. |
| `routes/health.js` | Liveness (`/healthz`), readiness (`/readyz`), and compatibility health (`/api/health`). Readiness checks the expected RPC chain, Supabase, registry address, relayer job table, and Redis nonce-lock availability. |
| `routes/evidence.js` | Authenticated ciphertext-only upload and retrieval. The request MIME is ignored; `.enc` envelope size is bounded. |
| `routes/public-proofs.js` | Public proof resolution and minimum metadata projection. Business snapshots are never serialized by these handlers. |
| `middleware/` | Helmet/CSP and CORS allowlist, request IDs and structured route-only logs, Supabase bearer authentication, and centralized generic error responses. |
| `chain/provider.js` | Allowlisted Arbitrum Sepolia/One chain ID mapping and provider construction. |
| `db/supabase-admin.js` | Server-only Supabase client construction. No database migration is run at startup. |
| `services/pinata-ciphertext-store.js` | Opaque ciphertext storage adapter. |
| `services/relayer-queue.js` | Per-wallet serialization and Redis lock, pending nonce selection, idempotent job journal, gas cap, bounded exponential retries, receipt tracking, same-nonce replacement, and low-balance warning. |

The HTTP process binds to `127.0.0.1`. Deployments behind a proxy must set `TRUST_PROXY` explicitly, provide an explicit `CORS_ALLOWED_ORIGINS` allowlist, and expose only intended routes. Production boot requires explicit Redis fail-closed configuration and backend service settings. `DEMO_ROUTES` is off by default and rejected in production.

## Proof lifecycle and verification boundary

1. An authenticated organization member creates a proof from approved inspection data. The existing application still stores business fields and `public_snapshot` in Postgres; full client-side field encryption is a later phase.
2. The issuer reviews the proof and signs EIP-712 typed data in the browser. The backend does not receive an issuer private key.
3. The backend relayer submits the signed v2 anchor through the transaction queue. The job key is based on operation and proof ID. Supabase stores job state; Redis serializes nonce allocation across backend instances. A missing migration or unavailable lock keeps the service unready/fails the write closed.
4. The public metadata endpoint returns only status, commitment, proof ID, chain/registry identifiers, attester/time placeholders, revoke flag, and transaction hash. It does not return the snapshot or business fields.
5. The browser obtains the commitment and identifiers, then reads `getProof`, `isValid`, and `verify()` from the configured public RPC. The browser compares the commitment with on-chain `evidenceHash`; the backend does not decide verification status. Legacy v1 reads use the v1 ABI and are labeled unsigned.

On-chain status proves contract acceptance of the issuer signature and current registry state. It does not prove physical measurement correctness, data availability, or that an issuer entered truthful information.

## Ciphertext path

The browser encrypts file bytes before upload and sends an `.enc` envelope as `application/octet-stream`. The API ignores client MIME and only stores the opaque bytes. The ciphertext is fetched back and decrypted client-side in the local integration test. The SQL constraint correction is in `supabase/migrations/202610100002_ciphertext_mime_constraint.sql`; it has **not** been applied to any Supabase project. Until the owner reviews and applies it, production upload rows may still be rejected by the existing database constraint.

## Relayer operations

`relayer_jobs` is an idempotency/reconciliation journal. The proposed schema is `supabase/migrations/202610100003_relayer_jobs.sql`; it has **not** been applied. `/readyz` checks the table exists. In production, Redis is required and the wallet-scoped lock is renewed while work is pending. Gas is estimated and capped, retries use the same pending nonce, and a stuck transaction can receive one same-nonce fee replacement. An ambiguous send outcome remains in `submitting` and requires receipt/nonce reconciliation; the service will not silently submit another nonce for that proof. Manual incident handling is still required for unresolved jobs or Redis/database loss.

## CI and operational boundary

The root workflow runs backend/frontend install, TypeScript, tests, build, audit, and full-history Gitleaks on Node 20/22/24. `smart-contract/.github/workflows/ci.yml` independently runs Foundry format/build/test, Slither, and full-history Gitleaks. No workflow deploys, broadcasts, or accesses Supabase. Migrations are reviewed files only; the owner performs any approved production migration manually with backup and rollback procedures.

## Known limits

- Organization and inspection business fields remain plaintext in Postgres; service-role infrastructure can read them.
- Public batch-code resolution remains unauthenticated and needs rate limiting/anti-enumeration work.
- Redis-backed rate limiting is applied to anchor/revoke handlers, not every public endpoint.
- The larger organization/proof route groups still live in `server.js`; full route-domain extraction and a production Playwright wallet E2E remain incomplete.
- The relayer uses an environment key in this phase. KMS/secret-manager integration and independent audit remain future work.
- No field-level selective disclosure, ZK verifier, trusted sensor/lab attestation, or production-readiness audit is included.
