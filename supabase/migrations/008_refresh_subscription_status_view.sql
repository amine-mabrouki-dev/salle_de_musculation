-- Ajoute à la vue la colonne de renouvellement introduite après sa création.
alter table public.subscriptions
  add column if not exists renew_on_payment boolean not null default false;

create or replace view public.subscription_status
with (security_invoker = true)
as
select
  subscriptions.id,
  subscriptions.user_id,
  subscriptions.member_id,
  subscriptions.section_id,
  subscriptions.tariff_id,
  subscriptions.duration,
  subscriptions.start_date,
  subscriptions.end_date,
  subscriptions.price,
  subscriptions.amount_due,
  case
    when subscriptions.end_date < (now() at time zone 'Africa/Tunis')::date then 'expire'
    when subscriptions.end_date <= (now() at time zone 'Africa/Tunis')::date + 7 then 'bientot'
    else 'actif'
  end as status,
  subscriptions.renew_on_payment
from public.subscriptions;

revoke all on table public.subscription_status from anon, authenticated;
grant select on table public.subscription_status to authenticated;
