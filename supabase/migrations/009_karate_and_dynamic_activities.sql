-- Ajoute le Karaté et permet au gérant de gérer le catalogue des activités.
alter table public.sections
  add column if not exists is_active boolean not null default true;

create unique index if not exists sections_name_lower_uidx
  on public.sections (lower(name));

insert into public.sections (name, coach_name, coach_phone)
select 'Karaté', null, null
where not exists (
  select 1 from public.sections where lower(trim(name)) = lower('Karaté')
);

insert into public.tariffs (section_id, category, monthly_price, annual_price)
select section.id, categorie.category, null, null
from public.sections as section
cross join (values ('adulte'), ('etudiant_enfant')) as categorie(category)
where lower(trim(section.name)) = lower('Karaté')
  and not exists (
    select 1
    from public.tariffs as tarif
    where tarif.section_id = section.id
      and tarif.category = categorie.category
  );

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
begin
  if auth.uid() is null then
    raise exception 'Une connexion est nécessaire pour gérer les activités.';
  end if;
  if char_length(nom) not between 1 and 80 then
    raise exception 'Le nom de l’activité doit contenir entre 1 et 80 caractères.';
  end if;
  if lower(nom) = 'tous' then
    raise exception 'Le nom « Tous » est réservé au filtre des activités.';
  end if;
  if p_adulte_monthly < 0 or p_adulte_annual < 0
    or p_etudiant_monthly < 0 or p_etudiant_annual < 0
  then
    raise exception 'Les tarifs ne peuvent pas être négatifs.';
  end if;
  if exists (
    select 1 from public.sections
    where lower(name) = lower(nom)
      and (p_section_id is null or id <> p_section_id)
  ) then
    raise exception 'Une activité porte déjà ce nom.';
  end if;

  if p_section_id is null then
    insert into public.sections (name, coach_name, coach_phone)
    values (nom, nullif(trim(coalesce(p_coach_name, '')), ''), nullif(trim(coalesce(p_coach_phone, '')), ''))
    returning id into activite_id;
  else
    update public.sections
    set name = nom,
        coach_name = nullif(trim(coalesce(p_coach_name, '')), ''),
        coach_phone = nullif(trim(coalesce(p_coach_phone, '')), '')
    where id = p_section_id
    returning id into activite_id;
    if not found then
      raise exception 'Cette activité est introuvable.';
    end if;
  end if;

  insert into public.tariffs (section_id, category, monthly_price, annual_price)
  values
    (activite_id, 'adulte', p_adulte_monthly, p_adulte_annual),
    (activite_id, 'etudiant_enfant', p_etudiant_monthly, p_etudiant_annual)
  on conflict (section_id, category) do update
  set monthly_price = excluded.monthly_price,
      annual_price = excluded.annual_price;

  return activite_id;
end;
$$;

revoke all on function public.enregistrer_activite(uuid, text, text, text, numeric, numeric, numeric, numeric) from public;
grant execute on function public.enregistrer_activite(uuid, text, text, text, numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.verifier_abonnement_activite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  activite_active boolean;
begin
  if new.price is null then
    raise exception 'Le tarif de cette formule est à définir. Renseignez son prix avant de créer ou modifier l’abonnement.';
  end if;
  if tg_op = 'INSERT' then
    select is_active into activite_active
    from public.sections
    where id = new.section_id;
    if not coalesce(activite_active, false) then
      raise exception 'Cette activité est désactivée et ne peut pas recevoir de nouvel abonnement.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.verifier_abonnement_activite() from public;
drop trigger if exists subscriptions_validate_activity_and_price on public.subscriptions;
create trigger subscriptions_validate_activity_and_price
  before insert or update of price, tariff_id, duration
  on public.subscriptions
  for each row
  execute function public.verifier_abonnement_activite();
