-- Identifiant idempotent pour les paiements synchronisés après une coupure réseau.

alter table public.payments
  add column if not exists client_request_id uuid;

create unique index if not exists payments_user_client_request_id_uidx
  on public.payments (user_id, client_request_id)
  where client_request_id is not null;

create or replace function public.enregistrer_paiement_hors_ligne(
  p_client_request_id uuid,
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
  paiement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Une connexion est nécessaire pour enregistrer un paiement.';
  end if;
  if p_client_request_id is null then
    raise exception 'L’identifiant de synchronisation du paiement est obligatoire.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended((select auth.uid())::text || ':' || p_client_request_id::text, 0)
  );

  select id into paiement_id
  from public.payments
  where user_id = (select auth.uid())
    and client_request_id = p_client_request_id;
  if found then
    return paiement_id;
  end if;

  paiement_id := public.enregistrer_paiement(
    p_member_id,
    p_subscription_id,
    p_amount,
    p_method,
    p_paid_at,
    p_renew_on_payment,
    p_renewal_price
  );

  update public.payments
  set client_request_id = p_client_request_id
  where id = paiement_id
    and user_id = (select auth.uid());
  if not found then
    raise exception 'Le paiement n’a pas pu être associé à sa demande de synchronisation.';
  end if;

  return paiement_id;
end;
$$;

revoke all on function public.enregistrer_paiement_hors_ligne(uuid, uuid, uuid, numeric, text, date, boolean, numeric) from public;
grant execute on function public.enregistrer_paiement_hors_ligne(uuid, uuid, uuid, numeric, text, date, boolean, numeric) to authenticated;
