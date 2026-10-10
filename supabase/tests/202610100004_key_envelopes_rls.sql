-- Run only with `supabase test db` against the local Supabase database.
begin;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'key-owner-a@local.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'key-member-a@local.test', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'key-owner-b@local.test', '', now(), '{}', '{}', now(), now());

insert into public.organizations (id, name, industry_key, created_by)
values
  ('a0000000-0000-4000-8000-000000000001', 'Local Org A', 'general', '10000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'Local Org B', 'general', '20000000-0000-4000-8000-000000000001');
insert into public.organization_members (organization_id, user_id, role, status)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'qc', 'active'),
  ('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.key_envelopes (organization_id, recipient_user_id, kid, envelope, envelope_algorithm)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'org-a-v1', '{"v":1,"alg":"A256GCM","data":"ciphertext-owner"}', 'A256GCM'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'org-a-v1', '{"v":1,"alg":"A256GCM","data":"ciphertext-member"}', 'A256GCM'),
  ('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'org-b-v1', '{"v":1,"alg":"A256GCM","data":"ciphertext-other-org"}', 'A256GCM');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.key_envelopes), 1, 'member sees only own envelope');
select is((select count(*)::int from public.key_envelopes where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0, 'member cannot read another organization envelope');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.key_envelopes), 1, 'second member sees only own envelope');
select is((select count(*)::int from public.key_envelopes where recipient_user_id = '10000000-0000-4000-8000-000000000001'), 0, 'member cannot read owner envelope');
reset role;

select * from finish();
rollback;
