-- Aligne également les opérations historiques de membre sur les durées exactes 30/365 jours.

create or replace function public.normaliser_fin_abonnement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.duration not in ('monthly', 'annual') then
    raise exception 'La durée choisie est invalide.';
  end if;
  new.end_date := new.start_date + case when new.duration = 'annual' then 365 else 30 end;
  return new;
end;
$$;

drop trigger if exists subscriptions_exact_duration_end_date on public.subscriptions;
create trigger subscriptions_exact_duration_end_date
  before insert or update of start_date, duration, end_date
  on public.subscriptions
  for each row
  execute function public.normaliser_fin_abonnement();

revoke all on function public.normaliser_fin_abonnement() from public;
