/**
 * run-sql-via-service-role.mjs
 * Calls the Supabase DB via a server-side approach:
 * Uses the supabase-js client with service role key to call a raw query
 * through the PostgreSQL connection indirectly.
 *
 * Since supabase-js doesn't support raw SQL directly, we use
 * the REST endpoint for a "dummy" RPC that executes the SQL.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY'); process.exit(1); }

const migPath = resolve(__dirname, '../../supabase/migrations/202610090004_fix_prevent_tenant_move.sql');
const sql = readFileSync(migPath, 'utf8');

// Split into individual statements
const statements = sql
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

const supabase = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: 'public' },
});

// Execute each statement via rpc if we have a sql executor, otherwise log
// Try calling the internal Supabase REST API for query execution
const projectRef = new URL(url).hostname.split('.')[0];

// Try the Supabase internal management endpoint
for (const stmt of statements) {
  if (!stmt) continue;
  const fullStmt = stmt + ';';
  process.stdout.write(`Executing: ${fullStmt.slice(0, 60)}... `);

  // Use supabase-js .rpc to try and call raw SQL - won't work without custom function
  // Instead, make a direct HTTP call to Supabase's internal pg-meta
  const r = await fetch(`${url}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'X-Connection-Encrypted': '1',
    },
    body: JSON.stringify({ query: fullStmt }),
  });

  const body = await r.text();
  console.log(r.status, body.slice(0, 100));
}
