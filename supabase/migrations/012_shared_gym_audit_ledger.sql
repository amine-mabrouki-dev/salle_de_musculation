-- Espaces de salle partagés, rôles, audit et écritures financières append-only.

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id),
  name text not null default 'Salle de Moularès',
  created_at timestamptz not null default now()
);
create table public.gym_memberships (
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('gerant', 'assistant')),
  display_name text not null default '',
  added_at timestamptz not null default now(),
  primary key (gym_id, user_id),
  unique (user_id)
);

insert into public.gyms (owner_user_id, name)
select id, coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), email, 'Salle de Moularès')
from auth.users;

insert into public.gym_memberships (gym_id, user_id, role, display_name)
select gyms.id, gyms.owner_user_id, 'gerant',
       coalesce(nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''), users.email, 'Gérant')
from auth.users as users
join public.gyms on gyms.owner_user_id = users.id
where not exists (
  select 1 from public.gym_memberships as membership where membership.user_id = users.id
);

alter table public.sections add column gym_id uuid;
alter table public.tariffs add column gym_id uuid;
alter table public.members add column gym_id uuid;
alter table public.subscriptions add column gym_id uuid;
alter table public.payments add column gym_id uuid;
alter table public.expenses add column gym_id uuid;
alter table public.gym_settings add column gym_id uuid;

update public.members as row
set gym_id = membership.gym_id
from public.gym_memberships as membership
where membership.user_id = row.user_id;
update public.subscriptions as row
set gym_id = membership.gym_id
from public.gym_memberships as membership
where membership.user_id = row.user_id;
update public.payments as row
set gym_id = membership.gym_id
from public.gym_memberships as membership
where membership.user_id = row.user_id;
update public.expenses as row
set gym_id = membership.gym_id
from public.gym_memberships as membership
where membership.user_id = row.user_id;
update public.gym_settings as row
set gym_id = membership.gym_id
from public.gym_memberships as membership
where membership.user_id = row.user_id;

create temporary table gym_section_remap (
  old_id uuid not null,
  gym_id uuid not null,
  new_id uuid not null,
  primary key (old_id, gym_id)
) on commit drop;

insert into gym_section_remap (old_id, gym_id, new_id)
select section.id, gym.id,
       case when gym.id = (select id from public.gyms order by id limit 1)
            then section.id else gen_random_uuid() end
from public.sections as section
cross join public.gyms as gym;

alter table public.sections drop constraint if exists sections_name_key;
drop index if exists public.sections_name_lower_uidx;

update public.sections
set gym_id = (select id from public.gyms order by id limit 1);

insert into public.sections (id, gym_id, name, coach_name, coach_phone, is_active)
select remap.new_id, remap.gym_id, section.name, section.coach_name, section.coach_phone, section.is_active
from gym_section_remap as remap
join public.sections as section on section.id = remap.old_id
where remap.new_id <> remap.old_id;

create temporary table gym_tariff_remap (
  old_id uuid not null,
  gym_id uuid not null,
  new_id uuid not null,
  new_section_id uuid not null,
  primary key (old_id, gym_id)
) on commit drop;

insert into gym_tariff_remap (old_id, gym_id, new_id, new_section_id)
select tariff.id, section_map.gym_id,
       case when section_map.gym_id = (select id from public.gyms order by id limit 1)
            then tariff.id else gen_random_uuid() end,
       section_map.new_id
from public.tariffs as tariff
join gym_section_remap as section_map on section_map.old_id = tariff.section_id;

update public.tariffs
set gym_id = (select id from public.gyms order by id limit 1);

insert into public.tariffs (id, gym_id, section_id, category, monthly_price, annual_price)
select tariff_map.new_id, tariff_map.gym_id, tariff_map.new_section_id,
       tariff.category, tariff.monthly_price, tariff.annual_price
from gym_tariff_remap as tariff_map
join public.tariffs as tariff on tariff.id = tariff_map.old_id
where tariff_map.new_id <> tariff_map.old_id;

update public.subscriptions as subscription
set section_id = section_map.new_id,
    tariff_id = tariff_map.new_id
from gym_section_remap as section_map, gym_tariff_remap as tariff_map
where section_map.old_id = subscription.section_id
  and section_map.gym_id = subscription.gym_id
  and tariff_map.old_id = subscription.tariff_id
  and tariff_map.gym_id = subscription.gym_id;

update public.expenses as expense
set section_id = section_map.new_id
from gym_section_remap as section_map
where section_map.old_id = expense.section_id
  and section_map.gym_id = expense.gym_id;

alter table public.sections alter column gym_id set not null;
alter table public.tariffs alter column gym_id set not null;
alter table public.members alter column gym_id set not null;
alter table public.subscriptions alter column gym_id set not null;
alter table public.payments alter column gym_id set not null;
alter table public.expenses alter column gym_id set not null;
alter table public.gym_settings alter column gym_id set not null;

alter table public.sections drop constraint if exists sections_name_key;
create unique index sections_gym_name_lower_uidx
  on public.sections (gym_id, lower(name));

alter table public.sections add constraint sections_gym_fk foreign key (gym_id) references public.gyms(id);
alter table public.tariffs add constraint tariffs_gym_fk foreign key (gym_id) references public.gyms(id);
alter table public.members add constraint members_gym_fk foreign key (gym_id) references public.gyms(id);
alter table public.subscriptions add constraint subscriptions_gym_fk foreign key (gym_id) references public.gyms(id);
alter table public.payments add constraint payments_gym_fk foreign key (gym_id) references public.gyms(id);
alter table public.expenses add constraint expenses_gym_fk foreign key (gym_id) references public.gyms(id);
alter table public.gym_settings add constraint gym_settings_gym_fk foreign key (gym_id) references public.gyms(id);

alter table public.subscriptions drop constraint if exists subscriptions_member_id_user_id_fkey;
alter table public.subscriptions
  add constraint subscriptions_member_id_gym_fk
  foreign key (member_id) references public.members(id) on delete restrict;
alter table public.payments drop constraint if exists payments_subscription_id_member_id_user_id_fkey;
alter table public.payments
  add constraint payments_member_gym_fk
  foreign key (member_id) references public.members(id) on delete restrict,
  add constraint payments_subscription_gym_fk
  foreign key (subscription_id) references public.subscriptions(id) on delete restrict;

alter table public.sections add column created_by uuid references auth.users(id);
alter table public.sections add column updated_by uuid references auth.users(id);
alter table public.tariffs add column created_by uuid references auth.users(id);
alter table public.tariffs add column updated_by uuid references auth.users(id);
alter table public.members add column created_by uuid references auth.users(id);
alter table public.members add column updated_by uuid references auth.users(id);
alter table public.subscriptions add column created_by uuid references auth.users(id);
alter table public.subscriptions add column updated_by uuid references auth.users(id);
alter table public.payments add column created_by uuid references auth.users(id);
alter table public.payments add column updated_by uuid references auth.users(id);
alter table public.expenses add column created_by uuid references auth.users(id);
alter table public.expenses add column updated_by uuid references auth.users(id);
alter table public.gym_settings add column created_by uuid references auth.users(id);
alter table public.gym_settings add column updated_by uuid references auth.users(id);

update public.sections set created_by = membership.user_id, updated_by = membership.user_id
from public.gym_memberships as membership where membership.gym_id = sections.gym_id;
update public.tariffs set created_by = membership.user_id, updated_by = membership.user_id
from public.gym_memberships as membership where membership.gym_id = tariffs.gym_id;
update public.members set created_by = user_id, updated_by = user_id;
update public.subscriptions set created_by = user_id, updated_by = user_id;
update public.payments set created_by = user_id, updated_by = user_id;
update public.expenses set created_by = user_id, updated_by = user_id;
update public.gym_settings set created_by = user_id, updated_by = user_id;

create table public.member_history (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  entity_table text not null check (entity_table in ('members', 'subscriptions')),
  entity_id uuid not null,
  previous_payload jsonb not null,
  user_id uuid not null references auth.users(id),
  changed_at timestamptz not null default clock_timestamp()
);
create index member_history_gym_changed_idx on public.member_history (gym_id, changed_at desc);
create index member_history_entity_idx on public.member_history (entity_table, entity_id, changed_at desc);

create table public.payment_cancellations (
  id uuid primary key,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  payment_id uuid not null references public.payments(id),
  type text not null default 'annulation' check (type = 'annulation'),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  cancelled_by uuid not null references auth.users(id),
  cancelled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (payment_id)
);

create table public.expense_cancellations (
  id uuid primary key,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  expense_id uuid not null references public.expenses(id),
  type text not null default 'annulation' check (type = 'annulation'),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  cancelled_by uuid not null references auth.users(id),
  cancelled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (expense_id)
);

insert into public.payment_cancellations (
  id, gym_id, user_id, payment_id, reason, cancelled_by, cancelled_at
)
select gen_random_uuid(), payment.gym_id, payment.user_id, payment.id,
       'Annulation antérieure à la mise en place du journal.',
       coalesce(payment.updated_by, payment.created_by, payment.user_id),
       coalesce(payment.updated_at, payment.recorded_at, payment.paid_at)
from public.payments as payment
where payment.deleted_at is not null
on conflict (payment_id) do nothing;

insert into public.expense_cancellations (
  id, gym_id, user_id, expense_id, reason, cancelled_by, cancelled_at
)
select gen_random_uuid(), expense.gym_id, expense.user_id, expense.id,
       'Annulation antérieure à la mise en place du journal.',
       coalesce(expense.updated_by, expense.created_by, expense.user_id),
       coalesce(expense.updated_at, expense.spent_at)
from public.expenses as expense
where expense.deleted_at is not null
on conflict (expense_id) do nothing;

drop view if exists public.subscription_status;
alter table public.subscriptions drop column amount_due;
alter table public.subscriptions drop column renew_on_payment;
alter table public.payments
  drop column previous_amount_due,
  drop column previous_price,
  drop column previous_renew_on_payment,
  drop column previous_start_date,
  drop column previous_end_date,
  drop column renewal_previous_start_date,
  drop column renewal_previous_end_date,
  drop column renewal_applied;

create or replace function public.gym_role_for(p_gym_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select membership.role
  from public.gym_memberships as membership
  where membership.gym_id = p_gym_id
    and membership.user_id = (select auth.uid())
$$;

create or replace function public.attribuer_gym_et_auteur()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  acces_gym uuid;
begin
  if tg_op = 'INSERT' then
    select membership.gym_id into acces_gym
    from public.gym_memberships as membership
    where membership.user_id = (select auth.uid());
    if new.gym_id is null then
      new.gym_id := acces_gym;
    end if;
    if new.gym_id is distinct from acces_gym then
      raise exception 'Cette salle ne correspond pas à votre compte.';
    end if;
    if tg_table_name not in ('sections', 'tariffs') then
      new.user_id := (select auth.uid());
    end if;
    new.created_by := (select auth.uid());
  else
    if new.gym_id is distinct from old.gym_id then
      raise exception 'La salle associée à une ligne ne peut pas être modifiée.';
    end if;
    if new.updated_at is null or new.updated_at <= old.updated_at then
      raise exception 'Cette modification est plus ancienne que la version enregistrée.';
    end if;
    new.created_by := old.created_by;
    if tg_table_name not in ('sections', 'tariffs') then
      new.user_id := old.user_id;
    end if;
  end if;
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create or replace function public.mettre_a_jour_horodatage_sync()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(new.updated_at, old.updated_at + interval '1 microsecond');
  else
    new.updated_at := coalesce(new.updated_at, clock_timestamp());
  end if;
  return new;
end;
$$;

create or replace function public.archiver_version_membre()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if to_jsonb(old) - 'updated_at' - 'updated_by'
     is distinct from to_jsonb(new) - 'updated_at' - 'updated_by' then
    insert into public.member_history (gym_id, entity_table, entity_id, previous_payload, user_id)
    values (old.gym_id, tg_table_name, old.id, to_jsonb(old), (select auth.uid()));
  end if;
  return new;
end;
$$;

create or replace function public.refuser_modification_financiere()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Les paiements et dépenses sont immuables. Ajoutez une ligne d’annulation au lieu de les modifier ou supprimer.';
end;
$$;

create or replace function public.attribuer_annulation_financiere()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  acces_gym uuid;
  source_gym uuid;
begin
  select membership.gym_id into acces_gym
  from public.gym_memberships as membership
  where membership.user_id = (select auth.uid());
  if tg_table_name = 'payment_cancellations' then
    select payment.gym_id into source_gym
    from public.payments as payment where payment.id = new.payment_id;
  else
    select expense.gym_id into source_gym
    from public.expenses as expense where expense.id = new.expense_id;
  end if;
  if source_gym is distinct from acces_gym then
    raise exception 'La ligne à annuler ne fait pas partie de votre salle.';
  end if;
  new.gym_id := acces_gym;
  new.user_id := (select auth.uid());
  new.cancelled_by := (select auth.uid());
  new.cancelled_at := clock_timestamp();
  new.created_by := (select auth.uid());
  new.updated_by := (select auth.uid());
  new.created_at := new.cancelled_at;
  new.updated_at := new.cancelled_at;
  new.deleted_at := null;
  return new;
end;
$$;

create trigger sections_attribution before insert or update on public.sections
  for each row execute function public.attribuer_gym_et_auteur();
create trigger tariffs_attribution before insert or update on public.tariffs
  for each row execute function public.attribuer_gym_et_auteur();
create trigger members_attribution before insert or update on public.members
  for each row execute function public.attribuer_gym_et_auteur();
create trigger subscriptions_attribution before insert or update on public.subscriptions
  for each row execute function public.attribuer_gym_et_auteur();
create trigger payments_attribution before insert on public.payments
  for each row execute function public.attribuer_gym_et_auteur();
create trigger expenses_attribution before insert on public.expenses
  for each row execute function public.attribuer_gym_et_auteur();
create trigger gym_settings_attribution before insert or update on public.gym_settings
  for each row execute function public.attribuer_gym_et_auteur();
create trigger members_history before update on public.members
  for each row execute function public.archiver_version_membre();
create trigger subscriptions_history before update on public.subscriptions
  for each row execute function public.archiver_version_membre();
create trigger payments_immutable before update or delete on public.payments
  for each row execute function public.refuser_modification_financiere();
create trigger expenses_immutable before update or delete on public.expenses
  for each row execute function public.refuser_modification_financiere();
create trigger payment_cancellations_immutable before update or delete on public.payment_cancellations
  for each row execute function public.refuser_modification_financiere();
create trigger expense_cancellations_immutable before update or delete on public.expense_cancellations
  for each row execute function public.refuser_modification_financiere();
create trigger payment_cancellations_attribution before insert on public.payment_cancellations
  for each row execute function public.attribuer_annulation_financiere();
create trigger expense_cancellations_attribution before insert on public.expense_cancellations
  for each row execute function public.attribuer_annulation_financiere();

drop view if exists public.subscription_status;
create view public.subscription_status
with (security_invoker = true)
as
select subscription.*,
       greatest(
         coalesce(subscription.price, 0)
         - coalesce(sum(payment.amount) filter (where cancellation.id is null), 0),
         0
       ) as amount_due,
       case
         when subscription.end_date < (now() at time zone 'Africa/Tunis')::date then 'expire'
         when subscription.end_date <= (now() at time zone 'Africa/Tunis')::date + 7 then 'bientot'
         else 'actif'
       end as status
from public.subscriptions as subscription
left join public.payments as payment
  on payment.subscription_id = subscription.id
 and payment.deleted_at is null
left join public.payment_cancellations as cancellation on cancellation.payment_id = payment.id
group by subscription.id;
grant select on public.subscription_status to authenticated;

create or replace view public.gym_monthly_totals
with (security_invoker = true)
as
with flux as (
  select payment.gym_id,
         date_trunc('month', payment.paid_at at time zone 'Africa/Tunis')::date as mois,
         sum(payment.amount) as revenus,
         0::numeric as depenses
  from public.payments as payment
  left join public.payment_cancellations as cancellation on cancellation.payment_id = payment.id
  where payment.deleted_at is null and cancellation.id is null
  group by payment.gym_id, date_trunc('month', payment.paid_at at time zone 'Africa/Tunis')::date
  union all
  select expense.gym_id,
         date_trunc('month', expense.spent_at at time zone 'Africa/Tunis')::date as mois,
         0::numeric as revenus,
         sum(expense.amount) as depenses
  from public.expenses as expense
  left join public.expense_cancellations as cancellation on cancellation.expense_id = expense.id
  where expense.deleted_at is null and cancellation.id is null
  group by expense.gym_id, date_trunc('month', expense.spent_at at time zone 'Africa/Tunis')::date
)
select gym_id, mois, sum(revenus) as revenus, sum(depenses) as depenses,
       sum(revenus) - sum(depenses) as profit
from flux
group by gym_id, mois;

create or replace function public.enregistrer_activite(
  p_section_id uuid,
  p_name text,
  p_coach_name text,
  p_coach_phone text,
  p_adulte_monthly numeric,
  p_adulte_annual numeric,
  p_etudiant_monthly numeric,
  p_etudiant_annual numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  activite_id uuid;
  nom text := trim(coalesce(p_name, ''));
  gym uuid;
begin
  select gym_id into gym from public.gym_memberships where user_id = (select auth.uid());
  if public.gym_role_for(gym) <> 'gerant' then
    raise exception 'Seul le gérant peut modifier les activités et les tarifs.';
  end if;
  if char_length(nom) not between 1 and 80 or lower(nom) = 'tous' then
    raise exception 'Le nom de l’activité doit contenir entre 1 et 80 caractères.';
  end if;
  if p_adulte_monthly < 0 or p_adulte_annual < 0 or p_etudiant_monthly < 0 or p_etudiant_annual < 0 then
    raise exception 'Les tarifs ne peuvent pas être négatifs.';
  end if;
  if exists (
    select 1 from public.sections
    where gym_id = gym and lower(name) = lower(nom)
      and (p_section_id is null or id <> p_section_id)
  ) then
    raise exception 'Une activité porte déjà ce nom.';
  end if;
  if p_section_id is null then
    insert into public.sections (gym_id, name, coach_name, coach_phone)
    values (gym, nom, nullif(trim(coalesce(p_coach_name, '')), ''), nullif(trim(coalesce(p_coach_phone, '')), ''))
    returning id into activite_id;
  else
    update public.sections
    set name = nom, coach_name = nullif(trim(coalesce(p_coach_name, '')), ''),
        coach_phone = nullif(trim(coalesce(p_coach_phone, '')), ''),
        updated_at = clock_timestamp()
    where id = p_section_id and gym_id = gym
    returning id into activite_id;
    if not found then raise exception 'Cette activité est introuvable.'; end if;
  end if;
  insert into public.tariffs (gym_id, section_id, category, monthly_price, annual_price)
  values
    (gym, activite_id, 'adulte', p_adulte_monthly, p_adulte_annual),
    (gym, activite_id, 'etudiant_enfant', p_etudiant_monthly, p_etudiant_annual)
  on conflict (section_id, category) do update
  set monthly_price = excluded.monthly_price, annual_price = excluded.annual_price;
  return activite_id;
end;
$$;

drop policy if exists "Les utilisateurs authentifiés gèrent les sections" on public.sections;
drop policy if exists "Les utilisateurs authentifiés gèrent les tarifs" on public.tariffs;
drop policy if exists "Chaque utilisateur gère ses membres" on public.members;
drop policy if exists "Chaque utilisateur gère ses abonnements" on public.subscriptions;
drop policy if exists "Chaque utilisateur gère ses paiements" on public.payments;
drop policy if exists "Chaque utilisateur gère ses dépenses" on public.expenses;
drop policy if exists "Chaque utilisateur gère ses réglages" on public.gym_settings;

alter table public.gyms enable row level security;
alter table public.gym_memberships enable row level security;
alter table public.member_history enable row level security;
alter table public.payment_cancellations enable row level security;
alter table public.expense_cancellations enable row level security;

create policy gym_read on public.gyms for select to authenticated
  using (public.gym_role_for(id) is not null);
create policy gym_update on public.gyms for update to authenticated
  using (public.gym_role_for(id) = 'gerant')
  with check (public.gym_role_for(id) = 'gerant');
create policy memberships_read on public.gym_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.gym_role_for(gym_id) = 'gerant');
create policy memberships_manage on public.gym_memberships for all to authenticated
  using (public.gym_role_for(gym_id) = 'gerant')
  with check (public.gym_role_for(gym_id) = 'gerant');
create policy history_read on public.member_history for select to authenticated
  using (public.gym_role_for(gym_id) = 'gerant');
create policy payment_cancellations_read on public.payment_cancellations for select to authenticated
  using (public.gym_role_for(gym_id) is not null);
create policy payment_cancellations_insert on public.payment_cancellations for insert to authenticated
  with check (public.gym_role_for(gym_id) is not null and cancelled_by = (select auth.uid()));
create policy expense_cancellations_read on public.expense_cancellations for select to authenticated
  using (public.gym_role_for(gym_id) = 'gerant');
create policy expense_cancellations_insert on public.expense_cancellations for insert to authenticated
  with check (public.gym_role_for(gym_id) = 'gerant' and cancelled_by = (select auth.uid()));

create policy sections_read on public.sections for select to authenticated
  using (public.gym_role_for(gym_id) is not null);
create policy sections_manage on public.sections for all to authenticated
  using (public.gym_role_for(gym_id) = 'gerant')
  with check (public.gym_role_for(gym_id) = 'gerant');
create policy tariffs_read on public.tariffs for select to authenticated
  using (public.gym_role_for(gym_id) is not null);
create policy tariffs_manage on public.tariffs for all to authenticated
  using (public.gym_role_for(gym_id) = 'gerant')
  with check (public.gym_role_for(gym_id) = 'gerant');
create policy members_read on public.members for select to authenticated
  using (public.gym_role_for(gym_id) is not null);
create policy members_manage on public.members for all to authenticated
  using (public.gym_role_for(gym_id) is not null)
  with check (public.gym_role_for(gym_id) is not null);
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.gym_role_for(gym_id) is not null);
create policy subscriptions_manage on public.subscriptions for all to authenticated
  using (public.gym_role_for(gym_id) is not null)
  with check (public.gym_role_for(gym_id) is not null);
create policy payments_read on public.payments for select to authenticated
  using (public.gym_role_for(gym_id) is not null);
create policy payments_insert on public.payments for insert to authenticated
  with check (public.gym_role_for(gym_id) is not null);
create policy expenses_read on public.expenses for select to authenticated
  using (public.gym_role_for(gym_id) = 'gerant');
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.gym_role_for(gym_id) = 'gerant');
create policy settings_read on public.gym_settings for select to authenticated
  using (public.gym_role_for(gym_id) = 'gerant');
create policy settings_manage on public.gym_settings for all to authenticated
  using (public.gym_role_for(gym_id) = 'gerant')
  with check (public.gym_role_for(gym_id) = 'gerant');

revoke all on public.gyms, public.gym_memberships, public.member_history,
  public.payment_cancellations, public.expense_cancellations from anon, authenticated;
grant select, update on public.gyms to authenticated;
grant select, insert, update, delete on public.gym_memberships to authenticated;
grant select on public.member_history to authenticated;
grant select, insert on public.payment_cancellations, public.expense_cancellations to authenticated;

revoke all on public.sections, public.tariffs, public.members, public.subscriptions,
  public.payments, public.expenses, public.gym_settings from anon, authenticated;
grant select, insert, update on public.sections, public.tariffs to authenticated;
grant select, insert, update on public.members, public.subscriptions to authenticated;
grant select, insert on public.payments, public.expenses to authenticated;
grant select, insert, update on public.gym_settings to authenticated;

revoke all on function public.gym_role_for(uuid) from public;
grant execute on function public.gym_role_for(uuid) to authenticated;
revoke all on function public.attribuer_gym_et_auteur() from public;
revoke all on function public.archiver_version_membre() from public;
revoke all on function public.refuser_modification_financiere() from public;
revoke all on function public.attribuer_annulation_financiere() from public;
revoke all on function public.enregistrer_activite(uuid, text, text, text, numeric, numeric, numeric, numeric) from public;
grant execute on function public.enregistrer_activite(uuid, text, text, text, numeric, numeric, numeric, numeric) to authenticated;

revoke all on function public.enregistrer_paiement(uuid, uuid, numeric, text, date, boolean, numeric) from public, authenticated;
revoke all on function public.enregistrer_paiement_hors_ligne(uuid, uuid, uuid, numeric, text, date, boolean, numeric) from public, authenticated;
revoke all on function public.annuler_paiement(uuid, uuid) from public, authenticated;
revoke all on function public.creer_ou_renouveler_abonnement(uuid, uuid, uuid, text, uuid, boolean, numeric) from public, authenticated;
revoke all on function public.creer_membre_avec_abonnement(text, text, uuid, uuid, text, date) from public, authenticated;
revoke all on function public.modifier_membre_avec_abonnement(uuid, text, text, uuid, uuid, uuid, text, date) from public, authenticated;
revoke all on function public.supprimer_membre(uuid) from public, authenticated;

drop policy if exists "Chaque gérant lit ses photos de membres" on storage.objects;
drop policy if exists "Chaque gérant enregistre ses photos de membres" on storage.objects;
drop policy if exists "Chaque gérant modifie ses photos de membres" on storage.objects;
drop policy if exists "Chaque gérant supprime ses photos de membres" on storage.objects;
create policy member_photos_gym_read on storage.objects for select to authenticated
  using (
    bucket_id = 'member-photos'
    and exists (
      select 1 from public.gym_memberships as uploader
      join public.gym_memberships as viewer on viewer.gym_id = uploader.gym_id
      where uploader.user_id::text = (storage.foldername(name))[1]
        and viewer.user_id = (select auth.uid())
    )
  );
create policy member_photos_gym_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.gym_role_for((
      select membership.gym_id from public.gym_memberships as membership
      where membership.user_id = (select auth.uid())
    )) is not null
  );
create policy member_photos_gym_update on storage.objects for update to authenticated
  using (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.gym_role_for((
      select membership.gym_id from public.gym_memberships as membership
      where membership.user_id = (select auth.uid())
    )) is not null
  )
  with check (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.gym_role_for((
      select membership.gym_id from public.gym_memberships as membership
      where membership.user_id = (select auth.uid())
    )) is not null
  );
create policy member_photos_gym_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.gym_role_for((
      select membership.gym_id from public.gym_memberships as membership
      where membership.user_id = (select auth.uid())
    )) is not null
  );

drop policy if exists "Chaque gérant lit sa photo de fond" on storage.objects;
drop policy if exists "Chaque gérant enregistre sa photo de fond" on storage.objects;
drop policy if exists "Chaque gérant modifie sa photo de fond" on storage.objects;
drop policy if exists "Chaque gérant supprime sa photo de fond" on storage.objects;
create policy gym_backgrounds_manager_access on storage.objects for all to authenticated
  using (
    bucket_id = 'gym-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.gym_role_for((
      select membership.gym_id from public.gym_memberships as membership
      where membership.user_id = (select auth.uid())
    )) = 'gerant'
  )
  with check (
    bucket_id = 'gym-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.gym_role_for((
      select membership.gym_id from public.gym_memberships as membership
      where membership.user_id = (select auth.uid())
    )) = 'gerant'
  );
