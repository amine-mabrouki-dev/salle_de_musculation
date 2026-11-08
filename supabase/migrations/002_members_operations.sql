-- Operations atomiques pour creer, modifier et supprimer une fiche membre.

alter table public.subscriptions
  alter column price drop not null,
  drop constraint if exists subscriptions_price_check;

alter table public.subscriptions
  add constraint subscriptions_price_check
  check (price is null or price >= 0);

create or replace function public.creer_membre_avec_abonnement(
  p_full_name text,
  p_phone text,
  p_section_id uuid,
  p_tariff_id uuid,
  p_duration text,
  p_start_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  nouvel_id uuid;
  tarif public.tariffs%rowtype;
  prix numeric(12, 3);
  fin_abonnement date;
begin
  if auth.uid() is null then
    raise exception 'Une connexion est nécessaire pour ajouter un membre.';
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 1 and 120 then
    raise exception 'Le nom du membre doit contenir entre 1 et 120 caractères.';
  end if;
  if p_phone is null or p_phone !~ '^[0-9]{8}$' then
    raise exception 'Le numéro de téléphone doit contenir exactement 8 chiffres.';
  end if;
  if p_duration is null or p_duration not in ('monthly', 'annual') then
    raise exception 'La durée choisie est invalide.';
  end if;
  if p_start_date is null then
    raise exception 'La date de début est obligatoire.';
  end if;

  select * into tarif
  from public.tariffs
  where id = p_tariff_id and section_id = p_section_id;
  if not found then
    raise exception 'Le tarif sélectionné ne correspond pas à cette section.';
  end if;

  prix := case p_duration
    when 'monthly' then tarif.monthly_price
    when 'annual' then tarif.annual_price
  end;
  fin_abonnement := case p_duration
    when 'monthly' then p_start_date + 30
    when 'annual' then p_start_date + 365
  end;

  insert into public.members (user_id, full_name, phone)
  values ((select auth.uid()), trim(p_full_name), p_phone)
  returning id into nouvel_id;

  insert into public.subscriptions (
    user_id, member_id, section_id, tariff_id, duration,
    start_date, end_date, price, amount_due
  )
  values (
    (select auth.uid()), nouvel_id, p_section_id, p_tariff_id, p_duration,
    p_start_date, fin_abonnement, prix, coalesce(prix, 0)
  );

  return nouvel_id;
end;
$$;

create or replace function public.modifier_membre_avec_abonnement(
  p_member_id uuid,
  p_full_name text,
  p_phone text,
  p_subscription_id uuid default null,
  p_section_id uuid default null,
  p_tariff_id uuid default null,
  p_duration text default null,
  p_start_date date default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  tarif public.tariffs%rowtype;
  prix numeric(12, 3);
  fin_abonnement date;
begin
  if char_length(trim(coalesce(p_full_name, ''))) not between 1 and 120 then
    raise exception 'Le nom du membre doit contenir entre 1 et 120 caractères.';
  end if;
  if p_phone is null or p_phone !~ '^[0-9]{8}$' then
    raise exception 'Le numéro de téléphone doit contenir exactement 8 chiffres.';
  end if;

  perform 1 from public.members
  where id = p_member_id and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Ce membre est introuvable.';
  end if;

  update public.members
  set full_name = trim(p_full_name), phone = p_phone
  where id = p_member_id and user_id = (select auth.uid());

  if p_subscription_id is null then
    return;
  end if;
  if p_section_id is null
    or p_tariff_id is null
    or p_duration is null
    or p_duration not in ('monthly', 'annual')
    or p_start_date is null
  then
    raise exception 'Les informations du nouvel abonnement sont incomplètes.';
  end if;

  perform 1 from public.subscriptions
  where id = p_subscription_id
    and member_id = p_member_id
    and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Cet abonnement est introuvable pour ce membre.';
  end if;

  select * into tarif from public.tariffs
  where id = p_tariff_id and section_id = p_section_id;
  if not found then
    raise exception 'Le tarif sélectionné ne correspond pas à cette section.';
  end if;

  prix := case p_duration
    when 'monthly' then tarif.monthly_price
    when 'annual' then tarif.annual_price
  end;
  fin_abonnement := case p_duration
    when 'monthly' then p_start_date + 30
    when 'annual' then p_start_date + 365
  end;

  update public.subscriptions
  set section_id = p_section_id,
      tariff_id = p_tariff_id,
      duration = p_duration,
      start_date = p_start_date,
      end_date = fin_abonnement,
      price = prix
  where id = p_subscription_id
    and member_id = p_member_id
    and user_id = (select auth.uid());
end;
$$;

create or replace function public.supprimer_membre(p_member_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.members
  where id = p_member_id and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Ce membre est introuvable.';
  end if;

  delete from public.payments
  where member_id = p_member_id and user_id = (select auth.uid());

  delete from public.subscriptions
  where member_id = p_member_id and user_id = (select auth.uid());

  delete from public.members
  where id = p_member_id and user_id = (select auth.uid());
end;
$$;

revoke all on function public.creer_membre_avec_abonnement(text, text, uuid, uuid, text, date) from public;
revoke all on function public.modifier_membre_avec_abonnement(uuid, text, text, uuid, uuid, uuid, text, date) from public;
revoke all on function public.supprimer_membre(uuid) from public;

grant execute on function public.creer_membre_avec_abonnement(text, text, uuid, uuid, text, date) to authenticated;
grant execute on function public.modifier_membre_avec_abonnement(uuid, text, text, uuid, uuid, uuid, text, date) to authenticated;
grant execute on function public.supprimer_membre(uuid) to authenticated;
