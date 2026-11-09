-- Jeu de données entièrement fictif. À exécuter dans le SQL Editor Supabase.
-- Requiert les migrations 001 à 014 et exactement un utilisateur Auth.
-- Les tarifs de la table tariffs ne sont jamais modifiés.

begin;

select pg_advisory_xact_lock(hashtext('gym4you-seed-demo'));

drop table if exists pg_temp.demo_expense_seed;
drop table if exists pg_temp.demo_month_revenue;
drop table if exists pg_temp.demo_payment_seed;
drop table if exists pg_temp.demo_subscription_seed;
drop table if exists pg_temp.demo_member_spec;
drop table if exists pg_temp.demo_context;

do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Le seed exige exactement un utilisateur Auth. Aucune donnée n’a été modifiée.';
  end if;

  if not exists (
    select 1
    from public.sections
    where lower(trim(name)) = lower('Musculation') and is_active
  ) or not exists (
    select 1
    from public.sections
    where lower(trim(name)) = lower('Fitness') and is_active
  ) or not exists (
    select 1
    from public.sections
    where lower(trim(name)) = lower('Kick-boxing') and is_active
  ) or not exists (
    select 1
    from public.sections
    where lower(trim(name)) = lower('Karaté') and is_active
  ) then
    raise exception 'Sections actives manquantes. Appliquez d’abord les migrations 001 à 009 et activez les quatre activités.';
  end if;
end;
$$;

create temporary table demo_context as
select id as user_id from auth.users;

drop table if exists pg_temp.demo_member_spec;
create temporary table demo_member_spec (
  member_no integer primary key,
  full_name text not null,
  phone text not null,
  section_name text not null,
  category text not null,
  duration text not null,
  end_offset integer not null,
  amount_due numeric(12, 3) not null default 0
);

insert into demo_member_spec
  (member_no, full_name, phone, section_name, category, duration, end_offset, amount_due)
values
  ( 1, 'Sami Ben Salem',       '20010001', 'Musculation', 'adulte',           'monthly',  -1, 0),
  ( 2, 'Youssef Gharbi',      '20010002', 'Musculation', 'adulte',           'monthly',  -6, 0),
  ( 3, 'Mohamed Amine Jlassi','20010003', 'Musculation', 'etudiant_enfant',  'monthly', -13, 0),
  ( 4, 'Fares Ben Amor',      '20010004', 'Musculation', 'adulte',           'monthly', -20, 0),
  ( 5, 'Nour Ben Yedder',     '20010005', 'Musculation', 'adulte',           'monthly',   0, 0),
  ( 6, 'Malek Trabelsi',      '20010006', 'Musculation', 'etudiant_enfant',  'monthly',   1, 0),
  ( 7, 'Rami Khemiri',        '20010007', 'Musculation', 'adulte',           'monthly',   3, 0),
  ( 8, 'Anis Bouazizi',       '20010008', 'Musculation', 'adulte',           'monthly',   5, 12),
  ( 9, 'Seifeddine Mabrouk',  '20010009', 'Musculation', 'etudiant_enfant',  'monthly',   6, 0),
  (10, 'Aymen Chaabane',      '20010010', 'Musculation', 'adulte',           'monthly',   7, 0),
  (11, 'Hichem Mansouri',     '20010011', 'Musculation', 'adulte',           'annual',   15, 0),
  (12, 'Bilel Saidi',         '20010012', 'Musculation', 'etudiant_enfant',  'annual',  140, 0),
  (13, 'Hatem Trabelsi',      '20010013', 'Musculation', 'adulte',           'annual',  200, 0),
  (14, 'Omar Ben Fredj',      '20010014', 'Musculation', 'adulte',           'annual',  260, 0),
  (15, 'Rayan Zribi',         '20010015', 'Musculation', 'etudiant_enfant',  'annual',  320, 0),
  (16, 'Yassine Karray',      '20010016', 'Musculation', 'etudiant_enfant',  'annual',  350, 0),
  (17, 'Ahmed Ben Hmida',     '20010017', 'Musculation', 'etudiant_enfant',  'monthly',  8, 0),
  (18, 'Marwen Dridi',        '20010018', 'Musculation', 'adulte',           'monthly',  9, 0),
  (19, 'Amira Trabelsi',      '50010019', 'Fitness',     'adulte',           'monthly', 10, 0),
  (20, 'Mariem Ben Salem',    '50010020', 'Fitness',     'adulte',           'monthly', 11, 15),
  (21, 'Ines Jebali',         '50010021', 'Fitness',     'adulte',           'monthly', 12, 0),
  (22, 'Rania Gharbi',        '50010022', 'Fitness',     'adulte',           'monthly', 13, 0),
  (23, 'Sarra Kammoun',       '50010023', 'Fitness',     'adulte',           'monthly', 14, 0),
  (24, 'Olfa Ben Amor',       '50010024', 'Fitness',     'adulte',           'monthly', 15, 0),
  (25, 'Mouna Chaabane',      '50010025', 'Fitness',     'adulte',           'monthly', 16, 0),
  (26, 'Fatma Mabrouk',       '50010026', 'Fitness',     'adulte',           'monthly', 17, 0),
  (27, 'Nesrine Khemiri',     '50010027', 'Fitness',     'adulte',           'monthly', 18, 0),
  (28, 'Wafa Jlassi',         '50010028', 'Fitness',     'adulte',           'monthly', 19, 0),
  (29, 'Karim Ben Yedder',    '90010029', 'Kick-boxing', 'adulte',           'monthly', 20, 0),
  (30, 'Tarek Mansouri',      '90010030', 'Kick-boxing', 'adulte',           'monthly', 21, 0),
  (31, 'Fethi Karray',        '90010031', 'Kick-boxing', 'adulte',           'monthly', 22, 0),
  (32, 'Wael Saidi',          '90010032', 'Kick-boxing', 'adulte',           'monthly', 23, 0),
  (33, 'Sofiene Dridi',       '90010033', 'Kick-boxing', 'adulte',           'monthly', 24, 0),
  (34, 'Mehdi Ben Fredj',     '90010034', 'Kick-boxing', 'adulte',           'monthly', 25, 0),
  (35, 'Nizar Bouazizi',      '90010035', 'Kick-boxing', 'adulte',           'monthly', 26, 0),
  (36, 'Ahmed Zribi',         '90010036', 'Karaté',      'adulte',           'monthly', 27, 0),
  (37, 'Fares Jebali',        '90010037', 'Karaté',      'adulte',           'monthly', 28, 0),
  (38, 'Adam Ben Salem',      '90010038', 'Karaté',      'etudiant_enfant',  'monthly', 29, 0),
  (39, 'Youssef Kammoun',     '90010039', 'Karaté',      'etudiant_enfant',  'monthly', 30, 0),
  (40, 'Rayen Trabelsi',      '90010040', 'Karaté',      'etudiant_enfant',  'monthly', 30, 0);

-- Marque les trois lignes produites par l’ancienne version du seed, sans toucher à d’autres fiches.
update public.members
set notes = '[DÉMO] Fiche fictive de démonstration'
where user_id = (select user_id from demo_context)
  and id in (
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000003'
  )
  and notes = 'Fiche fictive de démonstration'
  and full_name in ('DEMO — Sami Ben Salem', 'DEMO — Amira Trabelsi', 'DEMO — Youssef Gharbi');

update public.expenses
set label = '[DÉMO] Ancienne dépense de démonstration'
where user_id = (select user_id from demo_context)
  and id in (
    'd3000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000002'
  )
  and label in ('DEMO — Loyer de la salle', 'DEMO — Coach kick-boxing');

do $$
begin
  if exists (
    select 1
    from demo_member_spec as spec
    join public.members as member
      on member.id = ('d0000000-0000-4000-8000-' || lpad(spec.member_no::text, 12, '0'))::uuid
    where member.user_id <> (select user_id from demo_context)
       or left(coalesce(member.notes, ''), length('[DÉMO]')) <> '[DÉMO]'
  ) then
    raise exception 'Un identifiant de démonstration est déjà utilisé par une fiche non marquée. Aucune donnée n’a été modifiée.';
  end if;
end;
$$;

insert into public.members (id, user_id, full_name, phone, notes)
select
  ('d0000000-0000-4000-8000-' || lpad(spec.member_no::text, 12, '0'))::uuid,
  context.user_id,
  spec.full_name,
  spec.phone,
  '[DÉMO] Fiche fictive générée pour les essais'
from demo_member_spec as spec
cross join demo_context as context
on conflict (id) do update
set user_id = excluded.user_id,
    full_name = excluded.full_name,
    phone = excluded.phone,
    notes = excluded.notes
where members.user_id = excluded.user_id
  and left(coalesce(members.notes, ''), length('[DÉMO]')) = '[DÉMO]';

delete from public.payments
where member_id in (
  select id from public.members
  where user_id = (select user_id from demo_context)
    and left(coalesce(notes, ''), length('[DÉMO]')) = '[DÉMO]'
    and id between 'd0000000-0000-4000-8000-000000000001'::uuid
               and 'd0000000-0000-4000-8000-000000000040'::uuid
);

delete from public.subscriptions
where member_id in (
  select id from public.members
  where user_id = (select user_id from demo_context)
    and left(coalesce(notes, ''), length('[DÉMO]')) = '[DÉMO]'
    and id between 'd0000000-0000-4000-8000-000000000001'::uuid
               and 'd0000000-0000-4000-8000-000000000040'::uuid
);

delete from public.expenses
where user_id = (select user_id from demo_context)
  and left(label, length('[DÉMO]')) = '[DÉMO]'
  and id between 'd3000000-0000-4000-8000-000000000001'::uuid
              and 'd3000000-0000-4000-8000-999999999999'::uuid;

create temporary table demo_subscription_seed as
with subscription_spec as (
  select
    spec.member_no as subscription_no,
    spec.member_no,
    spec.section_name,
    spec.category,
    spec.duration,
    spec.end_offset,
    spec.amount_due
  from demo_member_spec as spec
  union all
  select 41, 1, 'Kick-boxing', 'adulte', 'monthly', 20, 10::numeric(12, 3)
  union all
  select 42, 2, 'Kick-boxing', 'adulte', 'monthly', 20, 0::numeric(12, 3)
)
select
  spec.subscription_no,
  spec.member_no,
  ('d1000000-0000-4000-8000-' || lpad(spec.subscription_no::text, 12, '0'))::uuid as id,
  ('d0000000-0000-4000-8000-' || lpad(spec.member_no::text, 12, '0'))::uuid as member_id,
  context.user_id,
  section.id as section_id,
  tariff.id as tariff_id,
  spec.duration,
  (current_date + spec.end_offset
    - case when spec.duration = 'annual' then 365 else 30 end) as start_date,
  (current_date + spec.end_offset) as end_date,
  coalesce(
    case when spec.duration = 'annual' then tariff.annual_price else tariff.monthly_price end,
    case spec.section_name
      when 'Musculation' then case when spec.category = 'etudiant_enfant'
        then case when spec.duration = 'annual' then 320 else 35 end
        else case when spec.duration = 'annual' then 420 else 45 end end
      when 'Fitness' then case when spec.category = 'etudiant_enfant'
        then case when spec.duration = 'annual' then 320 else 35 end
        else case when spec.duration = 'annual' then 380 else 40 end end
      when 'Kick-boxing' then case when spec.duration = 'annual' then 460 else 50 end
      when 'Karaté' then case when spec.category = 'etudiant_enfant'
        then case when spec.duration = 'annual' then 360 else 35 end
        else case when spec.duration = 'annual' then 420 else 45 end end
    end
  )::numeric(12, 3) as price,
  spec.amount_due::numeric(12, 3) as amount_due
from subscription_spec as spec
cross join demo_context as context
join public.sections as section
  on lower(trim(section.name)) = lower(spec.section_name)
 and section.is_active
join lateral (
  select candidate.*
  from public.tariffs as candidate
  where candidate.section_id = section.id
    and candidate.category in (spec.category, 'adulte')
  order by case when candidate.category = spec.category then 0 else 1 end
  limit 1
) as tariff on true;

do $$
begin
  if (select count(*) from demo_subscription_seed) <> 42 then
    raise exception 'Il faut les quatre sections actives et un tarif existant par activité. Vérifiez les migrations et tarifs.';
  end if;
  if exists (select 1 from demo_subscription_seed where price is null or price <= amount_due) then
    raise exception 'Un tarif fictif ou un solde de démonstration est invalide.';
  end if;
  if exists (
    select 1
    from demo_subscription_seed as demo
    join public.subscriptions as existing on existing.id = demo.id
    where existing.user_id <> demo.user_id or existing.member_id <> demo.member_id
  ) then
    raise exception 'Un identifiant d’abonnement de démonstration est déjà utilisé. Aucune donnée n’a été modifiée.';
  end if;
end;
$$;

insert into public.subscriptions (
  id, user_id, member_id, section_id, tariff_id, duration,
  start_date, end_date, price, amount_due, renew_on_payment
)
select
  id, user_id, member_id, section_id, tariff_id, duration,
  start_date, end_date, price, amount_due, false
from demo_subscription_seed
on conflict (id) do update
set user_id = excluded.user_id,
    member_id = excluded.member_id,
    section_id = excluded.section_id,
    tariff_id = excluded.tariff_id,
    duration = excluded.duration,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    price = excluded.price,
    amount_due = excluded.amount_due,
    renew_on_payment = excluded.renew_on_payment
where subscriptions.user_id = excluded.user_id
  and subscriptions.member_id = excluded.member_id;

create temporary table demo_payment_seed as
with scheduled_payments as (
  select
    subscription.*,
    subscription.start_date as paid_on,
    1::bigint as period_no,
    1::bigint as period_count
  from demo_subscription_seed as subscription
  where subscription.duration = 'monthly'

  union all

  select
    subscription.*,
    greatest(month_series.month_start::date, subscription.start_date) as paid_on,
    row_number() over (partition by subscription.id order by month_series.month_start)::bigint as period_no,
    count(*) over (partition by subscription.id)::bigint as period_count
  from demo_subscription_seed as subscription
  cross join lateral generate_series(
    greatest(
      date_trunc('month', current_date - interval '5 months'),
      date_trunc('month', subscription.start_date)
    ),
    date_trunc('month', current_date),
    interval '1 month'
  ) as month_series(month_start)
  where subscription.duration = 'annual'
),
weighted_payments as (
  select
    scheduled.*,
    (scheduled.price - scheduled.amount_due) as total_paid,
    (
      (1 + (scheduled.period_no - 1) * 0.025)
      * case when extract(month from scheduled.paid_on) in (7, 8) then 0.75 else 1 end
    )::numeric as payment_weight,
    sum(
      (1 + (scheduled.period_no - 1) * 0.025)
      * case when extract(month from scheduled.paid_on) in (7, 8) then 0.75 else 1 end
    )
      over (partition by scheduled.id) as total_weight
  from scheduled_payments as scheduled
),
rounded_payments as (
  select
    weighted.*,
    round(weighted.total_paid * weighted.payment_weight / weighted.total_weight, 3) as rounded_amount
  from weighted_payments as weighted
),
allocated_payments as (
  select
    rounded.*,
    case
      when rounded.period_no = rounded.period_count then
        rounded.total_paid - coalesce(
          sum(rounded.rounded_amount) over (
            partition by rounded.id
            order by rounded.period_no
            rows between unbounded preceding and 1 preceding
          ),
          0
        )
      else rounded.rounded_amount
    end as amount
  from rounded_payments as rounded
)
select
  row_number() over (order by allocated.subscription_no, allocated.paid_on)::integer as payment_no,
  ('d2000000-0000-4000-8000-' || lpad(
    row_number() over (order by allocated.subscription_no, allocated.paid_on)::text,
    12,
    '0'
  ))::uuid as id,
  allocated.user_id,
  allocated.member_id,
  allocated.id as subscription_id,
  allocated.amount::numeric(12, 3) as amount,
  allocated.paid_on,
  case
    when (allocated.member_no * 3 + allocated.period_no) % 7 = 0 then 'virement'
    else 'especes'
  end as method
from allocated_payments as allocated;

do $$
begin
  if exists (
    select 1
    from demo_payment_seed as demo
    join public.payments as existing on existing.id = demo.id
    where existing.user_id <> demo.user_id or existing.member_id <> demo.member_id
  ) then
    raise exception 'Un identifiant de paiement de démonstration est déjà utilisé. Aucune donnée n’a été modifiée.';
  end if;
end;
$$;

insert into public.payments (id, user_id, member_id, subscription_id, amount, paid_at, method)
select
  payment.id,
  payment.user_id,
  payment.member_id,
  payment.subscription_id,
  payment.amount,
  payment.paid_on::timestamp at time zone 'Africa/Tunis',
  payment.method
from demo_payment_seed as payment;

create temporary table demo_month_revenue as
select
  months.month_start::date as month_start,
  extract(year from age(date_trunc('month', current_date), months.month_start)) * 12
    + extract(month from age(date_trunc('month', current_date), months.month_start)) as rough_month_offset,
  coalesce(sum(payment.amount), 0)::numeric(12, 3) as revenue
from generate_series(
  date_trunc('month', current_date - interval '5 months'),
  date_trunc('month', current_date),
  interval '1 month'
) as months(month_start)
left join public.payments as payment
  on payment.user_id = (select user_id from demo_context)
 and payment.member_id in (select member_id from demo_subscription_seed)
 and payment.paid_at >= months.month_start at time zone 'Africa/Tunis'
 and payment.paid_at < (months.month_start + interval '1 month') at time zone 'Africa/Tunis'
group by months.month_start;

create temporary table demo_expense_seed as
with expense_items as (
  select
    revenue.month_start,
    revenue.revenue,
    extract(year from age(date_trunc('month', current_date), revenue.month_start)) * 12
      + extract(month from age(date_trunc('month', current_date), revenue.month_start)) as month_offset,
    item.item_no,
    item.label,
    item.category,
    item.section_name,
    case
      when item.item_no = 1 and revenue.month_start not in (
        date_trunc('month', current_date - interval '4 months')::date,
        date_trunc('month', current_date - interval '1 month')::date
      ) then 0.38
      else item.share
    end as share
  from demo_month_revenue as revenue
  cross join (values
    (1, '[DÉMO] Loyer de la salle',             'loyer',         null::text,       0.32::numeric),
    (2, '[DÉMO] STEG et eau',                   'energie',       null::text,       0.14::numeric),
    (3, '[DÉMO] Entretien des machines',        'entretien',     null::text,       0.08::numeric),
    (4, '[DÉMO] Publicité locale',              'publicite',     null::text,       0.06::numeric),
    (5, '[DÉMO] Salaire coach Fitness',         'salaire_coach', 'Fitness',         0.14::numeric),
    (6, '[DÉMO] Salaire coach Kick-boxing',     'salaire_coach', 'Kick-boxing',     0.11::numeric),
    (7, '[DÉMO] Salaire coach Karaté',          'salaire_coach', 'Karaté',          0.09::numeric)
  ) as item(item_no, label, category, section_name, share)
  union all
  select
    revenue.month_start,
    revenue.revenue,
    extract(year from age(date_trunc('month', current_date), revenue.month_start)) * 12
      + extract(month from age(date_trunc('month', current_date), revenue.month_start)) as month_offset,
    8,
    '[DÉMO] Achat ponctuel de matériel',
    'materiel',
    null::text,
    0.06::numeric
  from demo_month_revenue as revenue
  where revenue.month_start in (
    date_trunc('month', current_date - interval '4 months')::date,
    date_trunc('month', current_date - interval '1 month')::date
  )
),
priced_expenses as (
  select
    item.*,
    case when item.month_offset = 3 then 0.97 else 0.70 end as expense_rate,
    case
      when item.section_name is null then null::uuid
      else section.id
    end as section_id
  from expense_items as item
  left join public.sections as section
    on lower(trim(section.name)) = lower(item.section_name)
),
identified_expenses as (
  select
    row_number() over (order by priced.month_start, priced.item_no)::integer as expense_no,
    priced.*
  from priced_expenses as priced
)
select
  ('d3000000-0000-4000-8000-' || lpad(expense_no::text, 12, '0'))::uuid as id,
  (select user_id from demo_context) as user_id,
  label,
  greatest(round(revenue * expense_rate * share, 3), 0.001)::numeric(12, 3) as amount,
  category,
  section_id,
  (
    month_start
    + least(2, greatest(0, current_date - month_start))
  )::timestamp at time zone 'Africa/Tunis' as spent_at
from identified_expenses;

do $$
begin
  if exists (
    select 1
    from demo_expense_seed as demo
    join public.expenses as existing on existing.id = demo.id
    where existing.user_id <> demo.user_id
       or left(existing.label, length('[DÉMO]')) <> '[DÉMO]'
  ) then
    raise exception 'Un identifiant de dépense de démonstration est déjà utilisé. Aucune donnée n’a été modifiée.';
  end if;
end;
$$;

insert into public.expenses (id, user_id, label, amount, category, section_id, spent_at)
select id, user_id, label, amount, category, section_id, spent_at
from demo_expense_seed;

do $$
declare
  nombre_membres integer;
  nombre_abonnements integer;
  nombre_paiements integer;
  nombre_depenses integer;
  nombre_expires integer;
  nombre_proches integer;
  nombre_annuels integer;
  nombre_soldes integer;
  nombre_musculation integer;
  nombre_fitness integer;
  nombre_kickboxing integer;
  nombre_karate integer;
  nombre_annuel_expirant_15 integer;
begin
  select count(*) into nombre_membres
  from public.members
  where id between 'd0000000-0000-4000-8000-000000000001'::uuid
               and 'd0000000-0000-4000-8000-000000000040'::uuid
    and left(coalesce(notes, ''), length('[DÉMO]')) = '[DÉMO]';

  select count(*) into nombre_abonnements
  from public.subscriptions as subscription
  join demo_subscription_seed as demo
    on demo.id = subscription.id
   and demo.member_id = subscription.member_id
   and demo.user_id = subscription.user_id;
  select count(*) into nombre_paiements
  from public.payments as payment
  join demo_payment_seed as demo
    on demo.id = payment.id
   and demo.member_id = payment.member_id
   and demo.user_id = payment.user_id;
  select count(*) into nombre_depenses
  from public.expenses as expense
  join demo_expense_seed as demo
    on demo.id = expense.id
   and demo.user_id = expense.user_id
   and demo.label = expense.label;
  select count(*) into nombre_expires
  from demo_subscription_seed
  where subscription_no between 1 and 40
    and end_date between current_date - 20 and current_date - 1;
  select count(*) into nombre_proches
  from demo_subscription_seed
  where subscription_no between 1 and 40
    and end_date between current_date and current_date + 7;
  select count(*) into nombre_annuels
  from demo_subscription_seed
  where subscription_no between 1 and 40 and duration = 'annual';
  select count(*) into nombre_soldes
  from demo_subscription_seed
  where amount_due > 0;
  select count(*) into nombre_musculation
  from demo_member_spec where section_name = 'Musculation';
  select count(*) into nombre_fitness
  from demo_member_spec where section_name = 'Fitness';
  select count(*) into nombre_kickboxing
  from demo_member_spec where section_name = 'Kick-boxing';
  select count(*) into nombre_karate
  from demo_member_spec where section_name = 'Karaté';
  select count(*) into nombre_annuel_expirant_15
  from demo_subscription_seed
  where subscription_no between 1 and 40
    and duration = 'annual'
    and end_date = current_date + 15;

  if nombre_membres <> 40 or nombre_abonnements <> 42
    or nombre_paiements <> (select count(*) from demo_payment_seed)
    or nombre_depenses <> (select count(*) from demo_expense_seed)
    or nombre_expires <> 4 or nombre_proches <> 6
    or nombre_annuels <> 6 or nombre_soldes <> 3
    or nombre_musculation <> 18 or nombre_fitness <> 10
    or nombre_kickboxing <> 7 or nombre_karate <> 5
    or nombre_annuel_expirant_15 <> 1
  then
    raise exception 'Contrôle du seed échoué (membres %, abonnements %, paiements %, dépenses %, expirés %, proches %, annuels %, soldes %, sections %/%/%/%, annuel +15j %).',
      nombre_membres, nombre_abonnements, nombre_paiements, nombre_depenses,
      nombre_expires, nombre_proches, nombre_annuels, nombre_soldes, nombre_musculation, nombre_fitness,
      nombre_kickboxing, nombre_karate, nombre_annuel_expirant_15;
  end if;

  if exists (
    select 1 from demo_month_revenue
    where revenue <= 0
  ) or exists (
    select 1
    from demo_month_revenue as revenue
    join (
      select
        date_trunc('month', spent_at at time zone 'Africa/Tunis')::date as month_start,
        sum(amount) as expenses
      from public.expenses
      where user_id = (select user_id from demo_context)
        and left(label, length('[DÉMO]')) = '[DÉMO]'
        and id between 'd3000000-0000-4000-8000-000000000001'::uuid
                    and 'd3000000-0000-4000-8000-999999999999'::uuid
        and spent_at >= date_trunc('month', current_date - interval '5 months') at time zone 'Africa/Tunis'
        and spent_at < (date_trunc('month', current_date) + interval '1 month') at time zone 'Africa/Tunis'
      group by 1
    ) as expense on expense.month_start = revenue.month_start
    where (revenue.rough_month_offset <> 3 and expense.expenses >= revenue.revenue)
       or (revenue.rough_month_offset = 3
           and (expense.expenses / revenue.revenue < 0.95
             or expense.expenses / revenue.revenue > 0.99))
  ) then
    raise exception 'Contrôle des revenus et dépenses échoué : les six mois doivent être bénéficiaires, sauf le mois creux.';
  end if;
end;
$$;

commit;

select
  month_start as mois,
  income.revenue as revenus_dt,
  coalesce(expense.total, 0)::numeric(12, 3) as depenses_dt,
  (income.revenue - coalesce(expense.total, 0))::numeric(12, 3) as profit_dt
from (
  select
    date_trunc('month', current_date - interval '5 months')::date as first_month
) as month_range
cross join lateral generate_series(
  month_range.first_month,
  date_trunc('month', current_date)::date,
  interval '1 month'
) as month_series(month_start)
left join lateral (
  select sum(payment.amount)::numeric(12, 3) as revenue
  from public.payments as payment
  join public.members as member on member.id = payment.member_id
  where member.user_id = (select id from auth.users order by created_at limit 1)
    and left(coalesce(member.notes, ''), length('[DÉMO]')) = '[DÉMO]'
    and member.id between 'd0000000-0000-4000-8000-000000000001'::uuid
                      and 'd0000000-0000-4000-8000-000000000040'::uuid
    and payment.paid_at >= month_series.month_start at time zone 'Africa/Tunis'
    and payment.paid_at < (month_series.month_start + interval '1 month') at time zone 'Africa/Tunis'
) as income on true
left join lateral (
  select sum(expense.amount)::numeric(12, 3) as total
  from public.expenses as expense
  where left(expense.label, length('[DÉMO]')) = '[DÉMO]'
    and expense.user_id = (select id from auth.users order by created_at limit 1)
    and expense.id between 'd3000000-0000-4000-8000-000000000001'::uuid
                       and 'd3000000-0000-4000-8000-999999999999'::uuid
    and expense.spent_at >= month_series.month_start at time zone 'Africa/Tunis'
    and expense.spent_at < (month_series.month_start + interval '1 month') at time zone 'Africa/Tunis'
) as expense on true
order by month_start;
