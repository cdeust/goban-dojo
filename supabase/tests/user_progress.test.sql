begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

-- Dedicated test users in the disposable local database, never in production.
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'dojo-rls-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'dojo-rls-b@example.invalid');
insert into public.user_progress (user_id, space, payload) values
  ('10000000-0000-4000-8000-000000000001', 'school', '{}'),
  ('10000000-0000-4000-8000-000000000002', 'school', '{}');

select ok((select relrowsecurity from pg_class where oid = 'public.user_progress'::regclass), 'RLS enabled');
select ok(not has_table_privilege('anon', 'public.user_progress', 'select'), 'visitor cannot read progress');
select ok(not has_table_privilege('anon', 'public.user_progress', 'insert'), 'visitor cannot persist progress');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select is((select count(*) from public.user_progress), 1::bigint, 'account sees one personal space');
select is((select user_id::text from public.user_progress), '10000000-0000-4000-8000-000000000001', 'only owner data returned');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}', true);
select is((select user_id::text from public.user_progress), '10000000-0000-4000-8000-000000000002', 'second account sees its data only');
reset role;
select * from finish();
rollback;
