begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth;

select plan(2);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values (
  'a1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'overlap-test@gym4you.invalid', '',
  now(), now(), '{}'::jsonb, '{}'::jsonb
);

insert into public.gyms (id, owner_user_id, name)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Salle de test abonnements'
);

insert into public.gym_memberships (gym_id, user_id, role, display_name)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'gerant',
  'Test'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.sections (id, gym_id, name, is_active)
values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'Test chevauchement',
  true
);

insert into public.tariffs (id, gym_id, section_id, category, monthly_price)
values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'adulte',
  45
);

insert into public.members (id, user_id, gym_id, full_name, phone, notes)
values (
  'a5000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'Test chevauchement',
  '20000000',
  'Fixture temporaire'
);

insert into public.subscriptions (
  id, user_id, gym_id, member_id, section_id, tariff_id, duration,
  start_date, end_date, price, amount_due
)
values (
  'a6000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'monthly',
  date '2026-01-01',
  date '2026-01-31',
  45,
  45
);

select throws_ok(
  $$insert into public.subscriptions (
      id, user_id, gym_id, member_id, section_id, tariff_id, duration,
      start_date, end_date, price, amount_due
    ) values (
      'a6000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a5000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'a4000000-0000-4000-8000-000000000001',
      'monthly',
      date '2026-01-31',
      date '2026-03-02',
      45,
      45
    )$$,
  '23P01',
  null,
  'la base refuse deux abonnements dont les dates se chevauchent'
);

insert into public.subscriptions (
  id, user_id, gym_id, member_id, section_id, tariff_id, duration,
  start_date, end_date, price, amount_due
)
values (
  'a6000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'monthly',
  date '2026-02-01',
  date '2026-03-03',
  45,
  45
);

select is(
  (select count(*)::integer
   from public.subscriptions
   where member_id = 'a5000000-0000-4000-8000-000000000001'
     and section_id = 'a3000000-0000-4000-8000-000000000001'),
  2,
  'deux périodes contiguës, avec un jour de début suivant la fin incluse, sont autorisées'
);

select * from finish();
rollback;
