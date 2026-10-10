# PANDU Deployment Runbook

**Status:** Runbook alpha. Deployment to a live Supabase project and either chain is not yet complete.

## 0. Current setup gate

The project URL and browser publishable key are configured in ignored `frontend/.env.local`. On 9 October 2026, Auth settings responded but reported Google disabled; `GET /rest/v1/organizations` returned 404. The tenant migration has not been applied. Backend `SUPABASE_SERVICE_ROLE_KEY` is not configured. Do not invite production users until these checks pass.

## 1. Supabase database and private files

1. Open the PANDU Supabase project dashboard and run `supabase/migrations/202610090001_multi_tenant_foundation.sql` in SQL Editor.
2. Confirm tables, policies, RPCs, and the private `quality-evidence` bucket exist.
3. In `Settings → API Keys`, use the publishable key only in `frontend/.env.local`. Put the `service_role` key in `backend/.env` or the hosting provider's secret store. Never add it to a `VITE_` variable.
4. Put a persistent random value of at least 32 characters in `PUBLIC_TOKEN_SECRET`. Keep it private and stable: changing it invalidates existing QR/link tokens.
5. Verify Auth and PostgREST after migration: `/auth/v1/settings` responds, and `/rest/v1/organizations?select=id&limit=0` no longer returns 404.
6. Test with two Google users and two organizations. Verify the users cannot read each other's rows, evidence files, memberships, or RPC resources.

## 2. Google login

1. In Google Cloud, create an OAuth client of type **Web application**. Configure the app's deployed origin and the Supabase callback URL shown in Supabase Auth → Google provider.
2. Enable Google in Supabase Auth → Sign In / Providers and save the client ID and secret there.
3. Configure Supabase Auth URL settings with the local origin `http://localhost:5173`, local callback `http://localhost:5173/workspace`, and the exact deployed origin/callback.
4. Restart Vite after editing `frontend/.env.local`. Test new login, callback, refresh persistence, expired session, and sign-out.
5. Keep Google OAuth secrets inside Supabase Dashboard. Never place them in the React project.

## 3. Backend secrets and local smoke workflow

Set the following in ignored `backend/.env` or server secrets:

```dotenv
NODE_ENV=production
TRUST_PROXY=1
REDIS_URL=rediss://<user>:<password>@<redis-host>:<port>
RATE_LIMIT_FAIL_CLOSED=true
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<sb_secret_server-only secret>
PUBLIC_TOKEN_SECRET=<stable random secret, at least 32 chars>
PANDU_CHAIN=arbitrum-sepolia
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
RELAYER_PRIVATE_KEY=<test-only relayer secret>
PANDU_REGISTRY_ADDRESS=<verified Arbitrum Sepolia registry>
ENABLE_MAINNET_ANCHOR=false
```

Produksi wajib menyetel `TRUST_PROXY` sesuai jumlah hop proxy tepercaya dan `REDIS_URL` untuk rate limiter lintas instance. Server menolak start produksi bila salah satunya kosong. `RATE_LIMIT_FAIL_CLOSED` default `true` pada produksi; jangan menonaktifkannya di produksi.

The `RELAYER_PRIVATE_KEY` must belong to a disposable test wallet. Do not send private keys, OAuth secrets, or Supabase secret keys through chat. Configure the frontend `VITE_API_URL` to the deployed backend origin before deploying the web app.

Run the testnet contract suite/build, deploy to Sepolia, then follow this data path:

1. Gmail user creates an organization, inspection profile, supplier, material, and batch.
2. QC creates an inspection, records measurements, uploads private evidence, and submits it.
3. A different QA user approves only a passing result.
4. QA creates the proof; relayer anchors it after 2 confirmations.
5. Scan the generated QR in a private browser. Confirm the page shows only the allowlisted snapshot and matching Sepolia transaction.
6. Mutate a copy of the snapshot in a local verification check and verify it reports mismatch; revoke a test proof and confirm the public page reports revoked.
7. Link MetaMask after Gmail login. Confirm the wallet receives a message-only prompt, costs no gas, and cannot change organization role. Test replay and a wallet already owned by another account.

## 4. Arbitrum One release gate

Arbitrum One uses real ETH for deployment and anchor gas. It is not a continuation of a Sepolia contract deployment; compile, deploy, verify, and store a separate contract address for chain ID `42161`.

1. Complete all Supabase/RLS tests and the full Sepolia workflow first.
2. Have the Solidity contract independently audited and use separate admin/deployer and relayer wallets. Mainnet deploy script requires `DEPLOYER_PRIVATE_KEY`.
3. Set `PANDU_CHAIN=arbitrum-one`, `ARBITRUM_ONE_RPC_URL`, a mainnet relayer key, and the appropriate registry address in a separately secured production environment.
4. Deploy only after explicit owner approval. The guarded command is `npm run deploy:arbitrum-one`; it requires `MAINNET_DEPLOY_CONFIRMATION="I UNDERSTAND THIS USES REAL ETH"`. Confirm RPC chain and address in Arbiscan before any proof is anchored.
5. Mainnet proof writes remain locked unless `ENABLE_MAINNET_ANCHOR=true`. Set that flag only after monitoring, incident response, key rotation, backup, and operator approval are ready.
6. Test a small-value operational rehearsal with an approved batch. Review the exact transaction, gas, snapshot fields, and revocation path before broader use.

No Arbitrum One deployment or mainnet transaction has been run by this setup.

## 5. Deploy web and API

- Frontend host: configure SPA fallback to `index.html`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL` at build time.
- Backend host: provide `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PUBLIC_TOKEN_SECRET`, selected chain RPC, `RELAYER_PRIVATE_KEY`, and matching registry address as runtime secrets.
- Backend production also requires `NODE_ENV=production`, `TRUST_PROXY`, and `REDIS_URL`; `RATE_LIMIT_FAIL_CLOSED` defaults to `true`.
- Set `FRONTEND_ORIGIN` to the exact production origin. Configure Supabase redirect allowlist and CORS to match it.
- Use HTTPS, request limits, structured redacted logs, health monitoring, database backups, and key-rotation procedures. Do not log access tokens, service-role keys, signatures, or uploaded file contents.
- Run production frontend build and backend syntax checks. Do not start public services before the Supabase migration and secrets are set.
