-- Champs et index nécessaires à la synchronisation hors connexion.
-- Les suppressions sont représentées par deleted_at, jamais par DELETE.

alter table public.sections
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.tariffs
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.members
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.subscriptions
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.payments
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.expenses
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create or replace function public.mettre_a_jour_horodatage_sync()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sections_updated_at_sync on public.sections;
create trigger sections_updated_at_sync
  before insert or update on public.sections
  for each row execute function public.mettre_a_jour_horodatage_sync();

drop trigger if exists tariffs_updated_at_sync on public.tariffs;
create trigger tariffs_updated_at_sync
  before insert or update on public.tariffs
  for each row execute function public.mettre_a_jour_horodatage_sync();

drop trigger if exists members_updated_at_sync on public.members;
create trigger members_updated_at_sync
  before insert or update on public.members
  for each row execute function public.mettre_a_jour_horodatage_sync();

drop trigger if exists subscriptions_updated_at_sync on public.subscriptions;
create trigger subscriptions_updated_at_sync
  before insert or update on public.subscriptions
  for each row execute function public.mettre_a_jour_horodatage_sync();

drop trigger if exists payments_updated_at_sync on public.payments;
create trigger payments_updated_at_sync
  before insert or update on public.payments
  for each row execute function public.mettre_a_jour_horodatage_sync();

drop trigger if exists expenses_updated_at_sync on public.expenses;
create trigger expenses_updated_at_sync
  before insert or update on public.expenses
  for each row execute function public.mettre_a_jour_horodatage_sync();

create index if not exists sections_updated_at_sync_idx on public.sections (updated_at);
create index if not exists tariffs_updated_at_sync_idx on public.tariffs (updated_at);
create index if not exists members_user_updated_at_sync_idx on public.members (user_id, updated_at);
create index if not exists subscriptions_user_updated_at_sync_idx on public.subscriptions (user_id, updated_at);
create index if not exists payments_user_updated_at_sync_idx on public.payments (user_id, updated_at);
create index if not exists expenses_user_updated_at_sync_idx on public.expenses (user_id, updated_at);

-- Les anciens RPC annulaient ces lignes physiquement. Ils conservent leur API,
-- mais les modifications sont désormais des suppressions logiques synchronisables.
create or replace function public.supprimer_membre(p_member_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.members
  where id = p_member_id
    and user_id = (select auth.uid())
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Ce membre est introuvable.';
  end if;

  update public.payments
  set deleted_at = clock_timestamp()
  where member_id = p_member_id
    and user_id = (select auth.uid())
    and deleted_at is null;

  update public.subscriptions
  set deleted_at = clock_timestamp()
  where member_id = p_member_id
    and user_id = (select auth.uid())
    and deleted_at is null;

  update public.members
  set deleted_at = clock_timestamp()
  where id = p_member_id
    and user_id = (select auth.uid())
    and deleted_at is null;
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
    and user_id = (select auth.uid())
    and deleted_at is null;
  if not found then
    raise exception 'Ce paiement est introuvable.';
  end if;

  select * into abonnement
  from public.subscriptions
  where id = paiement.subscription_id
    and member_id = p_member_id
    and user_id = (select auth.uid())
    and deleted_at is null
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
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Ce paiement a déjà été annulé.';
  end if;

  if exists (
    select 1
    from public.payments as paiement_plus_recent
    where paiement_plus_recent.subscription_id = paiement.subscription_id
      and paiement_plus_recent.user_id = (select auth.uid())
      and paiement_plus_recent.deleted_at is null
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

  update public.payments
  set deleted_at = clock_timestamp()
  where id = p_payment_id
    and member_id = p_member_id
    and user_id = (select auth.uid())
    and deleted_at is null;
end;
$$;

revoke all on function public.supprimer_membre(uuid) from public;
revoke all on function public.annuler_paiement(uuid, uuid) from public;
grant execute on function public.supprimer_membre(uuid) to authenticated;
grant execute on function public.annuler_paiement(uuid, uuid) to authenticated;

revoke delete on public.sections, public.tariffs, public.members, public.subscriptions, public.payments, public.expenses
  from anon, authenticated;
