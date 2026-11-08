-- Creation et renouvellement transactionnels des abonnements.

create or replace function public.creer_ou_renouveler_abonnement(
  p_member_id uuid,
  p_section_id uuid,
  p_tariff_id uuid,
  p_duration text,
  p_subscription_id uuid default null,
  p_confirm_annual_estimate boolean default false,
  p_manual_price numeric default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  tarif public.tariffs%rowtype;
  abonnement_source public.subscriptions%rowtype;
  prix numeric(12, 3);
  date_debut date;
  nouvel_id uuid;
  date_locale date := (now() at time zone 'Africa/Tunis')::date;
begin
  if auth.uid() is null then
    raise exception 'Une connexion est nécessaire pour gérer les abonnements.';
  end if;
  if p_duration is null or p_duration not in ('monthly', 'annual') then
    raise exception 'La durée choisie est invalide.';
  end if;

  perform 1 from public.members
  where id = p_member_id and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Ce membre est introuvable.';
  end if;

  select * into tarif
  from public.tariffs
  where id = p_tariff_id and section_id = p_section_id;
  if not found then
    raise exception 'Le tarif sélectionné ne correspond pas à cette section.';
  end if;

  if p_duration = 'monthly' then
    if tarif.monthly_price is null then
      if p_manual_price is null or p_manual_price < 0 then
        raise exception 'Aucun tarif mensuel n’est défini. Saisissez un prix valide.';
      end if;
      prix := p_manual_price;
    else
      prix := tarif.monthly_price;
    end if;
  elsif tarif.annual_price is not null then
    prix := tarif.annual_price;
  elsif tarif.monthly_price is not null then
    if not coalesce(p_confirm_annual_estimate, false) then
      raise exception 'Le tarif annuel proposé doit être confirmé.';
    end if;
    prix := tarif.monthly_price * 10;
  else
    if p_manual_price is null or p_manual_price < 0 then
      raise exception 'Aucun tarif annuel n’est défini. Saisissez un prix valide.';
    end if;
    prix := p_manual_price;
  end if;

  if p_subscription_id is null then
    date_debut := date_locale;
  else
    select * into abonnement_source
    from public.subscriptions
    where id = p_subscription_id
      and member_id = p_member_id
      and user_id = (select auth.uid())
    for update;
    if not found then
      raise exception 'Cet abonnement est introuvable pour ce membre.';
    end if;
    date_debut := greatest(date_locale, abonnement_source.end_date);
  end if;

  insert into public.subscriptions (
    user_id, member_id, section_id, tariff_id, duration,
    start_date, end_date, price, amount_due
  )
  values (
    (select auth.uid()),
    p_member_id,
    p_section_id,
    p_tariff_id,
    p_duration,
    date_debut,
    date_debut + case when p_duration = 'annual' then 365 else 30 end,
    prix,
    prix
  )
  returning id into nouvel_id;

  return nouvel_id;
end;
$$;

revoke all on function public.creer_ou_renouveler_abonnement(uuid, uuid, uuid, text, uuid, boolean, numeric) from public;
grant execute on function public.creer_ou_renouveler_abonnement(uuid, uuid, uuid, text, uuid, boolean, numeric) to authenticated;
