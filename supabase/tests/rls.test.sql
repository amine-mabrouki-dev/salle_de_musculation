-- Test pgTAP à exécuter dans une base de test Supabase après les migrations.
-- Le script ajoute puis supprime une ligne de test dans une transaction.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth;

select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values (
  'b1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'rls-test@gym4you.invalid', '',
  now(), now(), '{}'::jsonb, '{}'::jsonb
);

insert into public.gyms (id, owner_user_id, name)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Salle de test RLS'
);

insert into public.gym_memberships (gym_id, user_id, role, display_name)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'gerant',
  'Test RLS'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.sections (id, gym_id, name, is_active)
values (
  'b3000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'Test RLS',
  true
);

insert into public.tariffs (id, gym_id, section_id, category, monthly_price)
values (
  'b4000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'adulte',
  45
);

create temporary table rls_test_context as
select
  'b1000000-0000-4000-8000-000000000001'::uuid as owner_id,
  'b3000000-0000-4000-8000-000000000001'::uuid as section_id,
  'b4000000-0000-4000-8000-000000000001'::uuid as tariff_id;

insert into public.members (id, user_id, full_name, phone, notes)
select
  'd9000000-0000-4000-8000-000000000001',
  owner_id,
  'TEST RLS — à supprimer',
  '29999999',
  'Fixture temporaire du test automatisé'
from rls_test_context
on conflict (id) do nothing;

select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid = any(array[
     'public.sections'::regclass,
     'public.tariffs'::regclass,
     'public.members'::regclass,
     'public.subscriptions'::regclass,
     'public.payments'::regclass,
     'public.expenses'::regclass
   ])),
  'RLS est activée sur les six tables métier'
);
select ok(
  not has_table_privilege('anon', 'public.members', 'SELECT'),
  'anon ne peut pas lire members'
);
select ok(
  has_table_privilege('authenticated', 'public.sections', 'SELECT')
    and has_table_privilege('authenticated', 'public.tariffs', 'SELECT'),
  'le rôle authentifié peut lire le catalogue commun'
);

insert into public.subscriptions (
  id, user_id, member_id, section_id, tariff_id, duration,
  start_date, end_date, price
)
select
  'd9000000-0000-4000-8000-000000000002',
  owner_id,
  'd9000000-0000-4000-8000-000000000001',
  section_id,
  tariff_id,
  'monthly',
  current_date,
  current_date + 30,
  45
from rls_test_context
on conflict (id) do nothing;

select is(
  (select end_date from public.subscriptions where id = 'd9000000-0000-4000-8000-000000000002'),
  current_date + 30,
  'le trigger impose 30 jours à une durée mensuelle'
);

update public.subscriptions
set duration = 'annual',
    end_date = current_date,
    updated_at = clock_timestamp()
where id = 'd9000000-0000-4000-8000-000000000002';

select is(
  (select end_date from public.subscriptions where id = 'd9000000-0000-4000-8000-000000000002'),
  current_date + 365,
  'le trigger impose 365 jours à une durée annuelle'
);

update public.subscriptions
set duration = 'monthly',
    end_date = current_date,
    updated_at = clock_timestamp()
where id = 'd9000000-0000-4000-8000-000000000002';

insert into public.payments (id, user_id, member_id, subscription_id, amount, method)
select
  'd9000000-0000-4000-8000-000000000003',
  owner_id,
  'd9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000002',
  1,
  'especes'
from rls_test_context
on conflict (id) do nothing;

insert into public.expenses (id, user_id, label, amount, category)
select
  'd9000000-0000-4000-8000-000000000004',
  owner_id,
  'TEST RLS — à supprimer',
  1,
  'autre'
from rls_test_context
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', (select owner_id::text from rls_test_context), true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select owner_id::text from rls_test_context), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer
   from public.members as m
   join public.subscriptions as s on s.member_id = m.id
   join public.payments as p on p.subscription_id = s.id
   join public.expenses as e on e.user_id = m.user_id
   where m.id = 'd9000000-0000-4000-8000-000000000001'
     and s.id = 'd9000000-0000-4000-8000-000000000002'
     and p.id = 'd9000000-0000-4000-8000-000000000003'
     and e.id = 'd9000000-0000-4000-8000-000000000004'),
  1,
  'le propriétaire voit ses membres, abonnements, paiements et dépenses'
);

select throws_ok(
  $$insert into public.members (user_id, full_name, phone)
    values ('d9999999-0000-4000-8000-000000000099', 'Intrusion test', '29999998')$$,
  '42501',
  null,
  'un utilisateur ne peut pas créer une fiche au nom d’un autre compte'
);

select set_config('request.jwt.claim.sub', 'd9999999-0000-4000-8000-000000000099', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"d9999999-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer
   from public.members as m
   join public.subscriptions as s on s.member_id = m.id
   join public.payments as p on p.subscription_id = s.id
   join public.expenses as e on e.user_id = m.user_id
   where m.id = 'd9000000-0000-4000-8000-000000000001'
     and s.id = 'd9000000-0000-4000-8000-000000000002'
     and p.id = 'd9000000-0000-4000-8000-000000000003'
     and e.id = 'd9000000-0000-4000-8000-000000000004'),
  0,
  'un autre utilisateur ne voit pas les données du propriétaire'
);

reset role;
select * from finish();
rollback;
