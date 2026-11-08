-- Suivi transactionnel des paiements, soldes et renouvellements.

alter table public.subscriptions
  add column if not exists renew_on_payment boolean not null default false;

alter table public.payments
  add column if not exists recorded_at timestamptz not null default now(),
  add column if not exists renewal_applied boolean not null default false,
  add column if not exists renewal_previous_start_date date,
  add column if not exists renewal_previous_end_date date,
  add column if not exists previous_amount_due numeric(12, 3),
  add column if not exists previous_price numeric(12, 3),
  add column if not exists previous_renew_on_payment boolean,
  add column if not exists previous_start_date date,
  add column if not exists previous_end_date date;

create index if not exists payments_subscription_recorded_idx
  on public.payments (subscription_id, recorded_at desc, id desc);

update public.subscriptions
set amount_due = price
where amount_due = 0
  and price is not null
  and price > 0
  and not exists (
    select 1
    from public.payments
    where payments.subscription_id = subscriptions.id
  );

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
    when 'monthly' then (p_start_date + interval '30 days')::date
    when 'annual' then (p_start_date + interval '365 days')::date
  end;

  insert into public.members (user_id, full_name, phone)
  values ((select auth.uid()), trim(p_full_name), p_phone)
  returning id into nouvel_id;

  insert into public.subscriptions (
    user_id, member_id, section_id, tariff_id, duration,
    start_date, end_date, price, amount_due, renew_on_payment
  )
  values (
    (select auth.uid()), nouvel_id, p_section_id, p_tariff_id, p_duration,
    p_start_date, fin_abonnement, prix, coalesce(prix, 0), false
  );

  return nouvel_id;
end;
$$;

create or replace function public.enregistrer_paiement(
  p_member_id uuid,
  p_subscription_id uuid,
  p_amount numeric(12, 3),
  p_method text,
  p_paid_at date,
  p_renew_on_payment boolean default false,
  p_renewal_price numeric(12, 3) default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  abonnement public.subscriptions%rowtype;
  solde numeric(12, 3);
  solde_restant numeric(12, 3);
  date_debut_precedente date;
  date_fin_precedente date;
  paiement_id uuid;
  renouvellement_effectue boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Une connexion est nécessaire pour enregistrer un paiement.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant du paiement doit être supérieur à zéro.';
  end if;
  if p_method is null or p_method not in ('especes', 'virement', 'autre') then
    raise exception 'Le mode de paiement choisi est invalide.';
  end if;
  if p_paid_at is null then
    raise exception 'La date du paiement est obligatoire.';
  end if;
  if p_renew_on_payment is null then
    raise exception 'Le choix du renouvellement est obligatoire.';
  end if;

  select * into abonnement
  from public.subscriptions
  where id = p_subscription_id
    and member_id = p_member_id
    and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Cet abonnement est introuvable pour ce membre.';
  end if;

  solde := abonnement.amount_due;
  if p_renew_on_payment and solde = 0 then
    if coalesce(abonnement.price, p_renewal_price) is null
      or coalesce(abonnement.price, p_renewal_price) <= 0
    then
      raise exception 'Le prix de cet abonnement n’est pas défini. Modifiez le tarif avant le renouvellement.';
    end if;
    solde := coalesce(abonnement.price, p_renewal_price);
    abonnement.price := solde;
  elsif solde <= 0 then
    raise exception 'Aucun montant ne reste à payer. Activez le renouvellement pour enregistrer son règlement.';
  end if;

  if p_amount > solde then
    raise exception 'Le paiement dépasse le solde restant de % DT.', solde;
  end if;

  solde_restant := solde - p_amount;
  if solde_restant = 0 and p_renew_on_payment then
    date_debut_precedente := abonnement.start_date;
    date_fin_precedente := abonnement.end_date;
    abonnement.start_date := greatest(
      (now() at time zone 'Africa/Tunis')::date,
      abonnement.end_date
    );
    abonnement.end_date := abonnement.start_date
      + case when abonnement.duration = 'annual' then 365 else 30 end;
    renouvellement_effectue := true;
  end if;

  insert into public.payments (
    user_id,
    member_id,
    subscription_id,
    amount,
    paid_at,
    recorded_at,
    method,
    renewal_applied,
    renewal_previous_start_date,
    renewal_previous_end_date,
    previous_amount_due,
    previous_price,
    previous_renew_on_payment,
    previous_start_date,
    previous_end_date
  )
  values (
    (select auth.uid()),
    p_member_id,
    p_subscription_id,
    p_amount,
    p_paid_at::timestamp at time zone 'Africa/Tunis',
    clock_timestamp(),
    p_method,
    renouvellement_effectue,
    date_debut_precedente,
    date_fin_precedente,
    abonnement.amount_due,
    (select subscriptions.price from public.subscriptions where id = p_subscription_id),
    (select subscriptions.renew_on_payment from public.subscriptions where id = p_subscription_id),
    (select subscriptions.start_date from public.subscriptions where id = p_subscription_id),
    (select subscriptions.end_date from public.subscriptions where id = p_subscription_id)
  )
  returning id into paiement_id;

  update public.subscriptions
  set amount_due = solde_restant,
      price = abonnement.price,
      renew_on_payment = p_renew_on_payment and not renouvellement_effectue,
      start_date = abonnement.start_date,
      end_date = abonnement.end_date
  where id = p_subscription_id
    and member_id = p_member_id
    and user_id = (select auth.uid());

  return paiement_id;
end;
$$;

create or replace function public.annuler_paiement(
  p_member_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  paiement public.payments%rowtype;
  abonnement public.subscriptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Une connexion est nécessaire pour annuler un paiement.';
  end if;

  select * into paiement
  from public.payments
  where id = p_payment_id
    and member_id = p_member_id
    and user_id = (select auth.uid());
  if not found then
    raise exception 'Ce paiement est introuvable.';
  end if;

  select * into abonnement
  from public.subscriptions
  where id = paiement.subscription_id
    and member_id = p_member_id
    and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'L’abonnement associé à ce paiement est introuvable.';
  end if;

  select * into paiement
  from public.payments
  where id = p_payment_id
    and member_id = p_member_id
    and subscription_id = abonnement.id
    and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Ce paiement a déjà été annulé.';
  end if;

  if exists (
    select 1
    from public.payments as paiement_plus_recent
    where paiement_plus_recent.subscription_id = paiement.subscription_id
      and paiement_plus_recent.user_id = (select auth.uid())
      and (
        paiement_plus_recent.recorded_at > paiement.recorded_at
        or (
          paiement_plus_recent.recorded_at = paiement.recorded_at
          and paiement_plus_recent.id > paiement.id
        )
      )
  ) then
    raise exception 'Annulez d’abord les paiements plus récents de cet abonnement.';
  end if;

  update public.subscriptions
  set amount_due = amount_due + paiement.amount,
      renew_on_payment = case
        when paiement.renewal_applied then true
        else renew_on_payment
      end,
      start_date = case
        when paiement.renewal_applied then paiement.renewal_previous_start_date
        else start_date
      end,
      end_date = case
        when paiement.renewal_applied then paiement.renewal_previous_end_date
        else end_date
      end
  where id = abonnement.id
    and member_id = p_member_id
    and user_id = (select auth.uid());

  if paiement.previous_amount_due is not null then
    update public.subscriptions
    set amount_due = paiement.previous_amount_due,
        price = paiement.previous_price,
        renew_on_payment = coalesce(paiement.previous_renew_on_payment, false),
        start_date = coalesce(paiement.previous_start_date, start_date),
        end_date = coalesce(paiement.previous_end_date, end_date)
    where id = abonnement.id
      and member_id = p_member_id
      and user_id = (select auth.uid());
  end if;

  delete from public.payments
  where id = p_payment_id
    and member_id = p_member_id
    and user_id = (select auth.uid());
end;
$$;

revoke all on function public.enregistrer_paiement(uuid, uuid, numeric, text, date, boolean, numeric) from public;
revoke all on function public.annuler_paiement(uuid, uuid) from public;
grant execute on function public.enregistrer_paiement(uuid, uuid, numeric, text, date, boolean, numeric) to authenticated;
grant execute on function public.annuler_paiement(uuid, uuid) to authenticated;
