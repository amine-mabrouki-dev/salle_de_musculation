-- Un abonnement se termine à end_date incluse.
-- Deux périodes consécutives doivent donc se suivre du lendemain (end_date + 1).
-- Les lignes supprimées logiquement (deleted_at renseigné) ne bloquent pas la contrainte.
-- Le schéma actuel n'a pas de statut d'annulation pour les abonnements : deleted_at est le marqueur d'annulation.

create extension if not exists btree_gist;

do $$
declare
  nombre_chevauchements bigint;
  contrainte_existante text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subscriptions'
      and column_name = 'deleted_at'
  ) then
    alter table public.subscriptions add column deleted_at timestamptz;
  end if;

  select contype::text
    into contrainte_existante
  from pg_constraint
  where conrelid = 'public.subscriptions'::regclass
    and conname = 'subscriptions_no_overlap';

  if contrainte_existante = 'x' then
    return;
  elsif contrainte_existante is not null then
    raise exception 'Le nom subscriptions_no_overlap est déjà utilisé par une contrainte différente.';
  end if;

  select count(*)
    into nombre_chevauchements
  from public.subscriptions a
  join public.subscriptions b
    on a.member_id = b.member_id
   and a.section_id = b.section_id
   and a.id < b.id
   and daterange(a.start_date, a.end_date, '[]')
       && daterange(b.start_date, b.end_date, '[]')
  where a.deleted_at is null
    and b.deleted_at is null;

  if nombre_chevauchements > 0 then
    raise exception
      'La migration est arrêtée : % paire(s) d’abonnements se chevauchent. Exécutez d’abord supabase/diagnostic-chevauchements.sql, puis validez le nettoyage dans supabase/nettoyage-chevauchements.sql.',
      nombre_chevauchements;
  end if;

  alter table public.subscriptions
    add constraint subscriptions_no_overlap
    exclude using gist (
      member_id with =,
      section_id with =,
      daterange(start_date, end_date, '[]') with &&
    )
    where (deleted_at is null);
end;
$$;
