-- Finish workspace invitation lifecycle support.

create or replace function public.accept_organization_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  accepted_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  with accepted as (
    update public.organization_members
    set status = 'active'
    where user_id = actor_id and status = 'invited'
    returning organization_id
  )
  insert into public.audit_events(organization_id, actor_id, action, entity_type, details)
  select organization_id, actor_id, 'organization.invite_accepted', 'organization_member', '{}'::jsonb
  from accepted;

  get diagnostics accepted_count = row_count;
  return accepted_count;
end;
$$;

revoke all on function public.accept_organization_invites() from public, anon;
grant execute on function public.accept_organization_invites() to authenticated, service_role;
