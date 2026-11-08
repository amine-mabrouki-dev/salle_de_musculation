-- Schéma initial de gestion de la salle de Moularès.
-- Les sections et tarifs forment le catalogue commun de cette salle.
-- Les données des membres, abonnements, paiements et dépenses sont isolées par utilisateur.

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  coach_name text,
  coach_phone text
);

create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections (id) on delete restrict,
  category text not null check (category in ('adulte', 'etudiant_enfant')),
  monthly_price numeric(12, 3) check (monthly_price is null or monthly_price >= 0),
  annual_price numeric(12, 3) check (annual_price is null or annual_price >= 0),
  unique (section_id, category),
  unique (id, section_id)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_id uuid not null,
  section_id uuid not null references public.sections (id) on delete restrict,
  tariff_id uuid not null,
  duration text not null check (duration in ('monthly', 'annual')),
  start_date date not null,
  end_date date not null,
  price numeric(12, 3) not null check (price >= 0),
  amount_due numeric(12, 3) not null default 0 check (amount_due >= 0),
  check (end_date >= start_date),
  foreign key (member_id, user_id)
    references public.members (id, user_id) on delete restrict,
  foreign key (tariff_id, section_id)
    references public.tariffs (id, section_id) on delete restrict,
  unique (id, member_id, user_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_id uuid not null,
  subscription_id uuid not null,
  amount numeric(12, 3) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text not null check (method in ('especes', 'virement', 'autre')),
  foreign key (subscription_id, member_id, user_id)
    references public.subscriptions (id, member_id, user_id) on delete restrict
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 120),
  amount numeric(12, 3) not null check (amount > 0),
  category text not null check (
    category in (
      'loyer',
      'salaire_coach',
      'energie',
      'entretien',
      'publicite',
      'materiel',
      'autre'
    )
  ),
  section_id uuid references public.sections (id) on delete restrict,
  spent_at timestamptz not null default now()
);

create index members_full_name_idx on public.members (full_name);
create index members_user_id_idx on public.members (user_id);
create index subscriptions_end_date_idx on public.subscriptions (end_date);
create index subscriptions_user_id_end_date_idx on public.subscriptions (user_id, end_date);
create index subscriptions_member_id_idx on public.subscriptions (member_id);
create index payments_user_id_paid_at_idx on public.payments (user_id, paid_at desc);
create index expenses_user_id_spent_at_idx on public.expenses (user_id, spent_at desc);

alter table public.sections enable row level security;
alter table public.tariffs enable row level security;
alter table public.members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

create policy "Les utilisateurs authentifiés gèrent les sections"
  on public.sections for all to authenticated
  using (true)
  with check (true);

create policy "Les utilisateurs authentifiés gèrent les tarifs"
  on public.tariffs for all to authenticated
  using (true)
  with check (true);

create policy "Chaque utilisateur gère ses membres"
  on public.members for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Chaque utilisateur gère ses abonnements"
  on public.subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Chaque utilisateur gère ses paiements"
  on public.payments for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Chaque utilisateur gère ses dépenses"
  on public.expenses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.sections, public.tariffs from anon, authenticated;
revoke all on table public.members, public.subscriptions, public.payments, public.expenses
  from anon, authenticated;

grant select, insert, update, delete on table public.sections, public.tariffs to authenticated;
grant select, insert, update, delete
  on table public.members, public.subscriptions, public.payments, public.expenses
  to authenticated;

create or replace view public.subscription_status
with (security_invoker = true)
as
select
  subscriptions.*,
  case
    when subscriptions.end_date < (now() at time zone 'Africa/Tunis')::date then 'expire'
    when subscriptions.end_date <= (now() at time zone 'Africa/Tunis')::date + 7 then 'bientot'
    else 'actif'
  end as status
from public.subscriptions;

revoke all on table public.subscription_status from anon, authenticated;
grant select on table public.subscription_status to authenticated;

insert into public.sections (id, name)
values
  ('10000000-0000-4000-8000-000000000001', 'Musculation'),
  ('10000000-0000-4000-8000-000000000002', 'Femmes'),
  ('10000000-0000-4000-8000-000000000003', 'Kick-boxing')
on conflict (name) do nothing;

insert into public.tariffs (section_id, category, monthly_price, annual_price)
select sections.id, seed.category, seed.monthly_price, null
from (
  values
    ('Musculation', 'adulte', 45::numeric),
    ('Musculation', 'etudiant_enfant', 35::numeric),
    ('Femmes', 'adulte', 40::numeric),
    ('Kick-boxing', 'adulte', null::numeric)
) as seed(section_name, category, monthly_price)
join public.sections on sections.name = seed.section_name
on conflict (section_id, category) do nothing;
