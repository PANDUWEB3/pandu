/**
 * run-fix-via-rpc.mjs
 *
 * Applies the fix migration by calling a temporary helper RPC that
 * executes DDL using service role (SECURITY DEFINER).
 *
 * Steps:
 *  1. Create a one-time helper function via the REST API (service role can INSERT to pg_catalog? No.)
 *
 * Actually, supabase-js with service_role key can call any existing RPC.
 * We need another approach: use the Supabase Dashboard API token.
 *
 * This script will:
 * - Try calling the Supabase Management API if SUPABASE_PAT is set
 * - Otherwise, try to use supabase-js to call a helper RPC
 * - Otherwise, print the SQL for manual application
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY;

const migPath = resolve(__dirname, '../../supabase/migrations/202610090004_fix_prevent_tenant_move.sql');
const sql = readFileSync(migPath, 'utf8');

// The service_role JWT IS a valid Postgres session via PostgREST.
// We can use the "sql" endpoint exposed only on self-hosted Supabase.
// For Supabase Cloud, we need the Management API.

// Extract project ref
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

// Try Management API endpoint for running SQL (requires PAT or project JWT in some cases)
// Documented: POST https://api.supabase.com/v1/projects/{ref}/database/query
// Auth: Bearer <personal-access-token>

// Alternative documented: The Supabase CLI uses pg connection string.
// Since we don't have direct DB access, let's try using the "sql" RPC endpoint
// that some Supabase versions expose via the REST API using service_role.

const endpoints = [
  `${SUPABASE_URL}/rest/v1/rpc/run_sql`,
  `${SUPABASE_URL}/rest/v1/rpc/exec`,
  `${SUPABASE_URL}/rest/v1/rpc/query`,
];

for (const endpoint of endpoints) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });
  if (r.ok) {
    const body = await r.json().catch(() => ({}));
    console.log(`✅ Applied via ${endpoint}`, body);
    process.exit(0);
  }
  console.log(`❌ ${endpoint}: ${r.status}`);
}

// None worked — print manual instructions
console.log(`
════════════════════════════════════════════════════════
  TEMPEL SQL INI DI SUPABASE SQL EDITOR
  https://app.supabase.com/project/${projectRef}/sql/new
════════════════════════════════════════════════════════
`);
console.log(sql);
