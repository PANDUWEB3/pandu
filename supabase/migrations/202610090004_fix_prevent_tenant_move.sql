-- Fix: "record new has no field user_id"
--
-- WHY MIGRATION 003 DID NOT WORK:
--   Migration 003 tried using `if tg_table_name = 'organization_members'` at
--   runtime, but PostgreSQL PL/pgSQL compiles the entire function body at
--   definition time and resolves every record-field reference (NEW.user_id)
--   against the trigger table's row type — before any runtime branch is
--   evaluated.  So `new.user_id` fails for inspections, batches, materials,
--   etc. regardless of the if-branch, because those tables have no user_id.
--
-- FIX: Split into two separate trigger functions so each only references
--   fields that actually exist in the table it is attached to.
--   1. prevent_tenant_move()        — organization_id check only (all tables)
--   2. prevent_membership_id_move() — also checks user_id (org_members only)
--
-- This script is IDEMPOTENT: safe to run multiple times.
--   • Functions use CREATE OR REPLACE.
--   • Trigger uses DROP IF EXISTS before CREATE.

-- ── 1. Generic immutability guard (no user_id reference) ─────────────────────
create or replace function public.prevent_tenant_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  return new;
end;
$$;

-- ── 2. Membership-specific guard (has user_id column) ────────────────────────
create or replace function public.prevent_membership_id_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'membership user_id is immutable';
  end if;
  return new;
end;
$$;

-- ── 3. Replace the org-members trigger with the correct function ──────────────
-- DROP IF EXISTS handles: (a) first run, (b) reruns, (c) the old trigger that
-- already pointed at the broken generic function.
drop trigger if exists organization_members_no_move on public.organization_members;

create trigger organization_members_no_move
  before update on public.organization_members
  for each row execute function public.prevent_membership_id_move();

-- ── 4. Permissions ───────────────────────────────────────────────────────────
revoke all on function public.prevent_membership_id_move() from public, anon, authenticated;

-- ── 5. Verification (run after applying to confirm) ──────────────────────────
-- SELECT pg_get_triggerdef(t.oid)
-- FROM   pg_trigger AS t
-- WHERE  t.tgname = 'organization_members_no_move'
--   AND  t.tgrelid = 'public.organization_members'::regclass
--   AND  NOT t.tgisinternal;
-- Expected: BEFORE UPDATE ON public.organization_members FOR EACH ROW
--           EXECUTE FUNCTION public.prevent_membership_id_move()
