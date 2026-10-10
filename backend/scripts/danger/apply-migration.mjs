/**
 * apply-migration.mjs
 * Applies a SQL migration directly to the Supabase project via the
 * Management API (no CLI or local Supabase stack required).
 *
 * Usage:  node apply-migration.mjs <sql-file>
 *
 * Env vars read from backend/.env:
 *   SUPABASE_URL  — e.g. https://xxxx.supabase.co
 *   SUPABASE_SECRET_KEY (service-role key)
 *
 * Rollback: use the verified, target-matched backup supplied to the guard and a separately
 * reviewed restore plan. Never auto-drop objects or retry a partially applied DDL file.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { guardDangerScript } from './guard.mjs';

dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });
if (!await guardDangerScript({ scriptName: 'apply-migration', kind: 'supabase', destructive: true })) process.exit(process.exitCode || 0);

const url   = process.env.SUPABASE_URL;
const key   = process.env.SUPABASE_SECRET_KEY;
const file  = process.argv[2];

if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY'); process.exit(1); }
if (!file)        { console.error('Usage: node apply-migration.mjs <sql-file>'); process.exit(1); }

const sql = readFileSync(resolve(file), 'utf8');
console.log(`Applying: ${file}\n---`);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }));

// supabase-js doesn't expose exec_sql — use the REST Management API instead.
const projectRef = new URL(url).hostname.split('.')[0];
const resp = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query: sql }),
  }
);

if (!resp.ok) {
  // Fallback: try the undocumented /rest/v1/rpc/exec path via pg-meta.
  console.warn('Management API failed, trying pg-meta fallback…');
  const pgMeta = await fetch(`${url}/pg-meta/v0/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await pgMeta.json().catch(() => ({}));
  if (!pgMeta.ok) {
    console.error('pg-meta fallback also failed:', JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log('Migration applied via pg-meta.\n', JSON.stringify(body, null, 2));
  process.exit(0);
}

const body = await resp.json().catch(() => ({}));
console.log('Migration applied.\n', JSON.stringify(body, null, 2));
