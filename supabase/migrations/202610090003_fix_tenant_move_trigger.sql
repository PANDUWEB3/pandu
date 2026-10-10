-- PostgreSQL may evaluate both sides of an AND in PL/pgSQL conditions.
-- Keep table-specific row fields inside their own branch so triggers for
-- inspections, materials, batches, etc. never reference NEW.user_id.
create or replace function public.prevent_tenant_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;

  if tg_table_name = 'organization_members' then
    if new.user_id is distinct from old.user_id then
      raise exception 'membership user_id is immutable';
    end if;
  end if;

  return new;
end;
$$;
