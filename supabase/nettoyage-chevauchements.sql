-- Prévisualise puis marque les abonnements en double comme supprimés logiquement.
-- Le script termine par ROLLBACK : aucune modification ne sera conservée par défaut.
-- Après revue complète, remplacer uniquement ROLLBACK par COMMIT pour confirmer.
-- Les paiements sont immuables dans la migration 012. S'il faut les réaffecter,
-- ce script s'arrête sans modifier les abonnements : corrigez-les dans l'application
-- avec une annulation auditée puis un nouveau paiement lié au bon abonnement.

begin;

create temporary table _abonnements_a_garder (
  id uuid primary key,
  member_id uuid not null,
  section_id uuid not null,
  start_date date not null,
  end_date date not null
) on commit drop;

create temporary table _plan_nettoyage (
  abonnement_a_garder uuid not null,
  abonnement_a_annuler uuid primary key
) on commit drop;

do $$
declare
  candidat record;
  gagnant_id uuid;
begin
  for candidat in
    select id, member_id, section_id, start_date, end_date
    from public.subscriptions
    where deleted_at is null
    order by member_id, section_id, end_date desc, start_date desc, updated_at desc, id
  loop
    select garder.id
      into gagnant_id
    from _abonnements_a_garder garder
    where garder.member_id = candidat.member_id
      and garder.section_id = candidat.section_id
      and daterange(garder.start_date, garder.end_date, '[]')
          && daterange(candidat.start_date, candidat.end_date, '[]')
    order by garder.end_date desc, garder.start_date desc, garder.id
    limit 1;

    if gagnant_id is null then
      insert into _abonnements_a_garder (id, member_id, section_id, start_date, end_date)
      values (candidat.id, candidat.member_id, candidat.section_id, candidat.start_date, candidat.end_date);
    else
      insert into _plan_nettoyage (abonnement_a_garder, abonnement_a_annuler)
      values (gagnant_id, candidat.id);
    end if;
    gagnant_id := null;
  end loop;
end;
$$;

-- Aperçu des paires et des paiements qui devraient être déplacés.
select
  plan.abonnement_a_garder,
  garder.start_date as debut_conserve,
  garder.end_date as fin_conserve,
  plan.abonnement_a_annuler,
  annuler.start_date as debut_annule,
  annuler.end_date as fin_annule,
  count(paiement.id)::integer as paiements_a_corriger
from _plan_nettoyage plan
join public.subscriptions garder on garder.id = plan.abonnement_a_garder
join public.subscriptions annuler on annuler.id = plan.abonnement_a_annuler
left join public.payments paiement on paiement.subscription_id = annuler.id
group by plan.abonnement_a_garder, garder.start_date, garder.end_date,
         plan.abonnement_a_annuler, annuler.start_date, annuler.end_date
order by annuler.member_id, annuler.section_id, annuler.start_date;

-- Ne contourne pas le journal financier append-only : une réaffectation directe
-- échouerait sur le déclencheur payments_immutable de la migration 012.
do $$
declare
  nombre_paiements bigint;
begin
  select count(*)
    into nombre_paiements
  from public.payments paiement
  join _plan_nettoyage plan on plan.abonnement_a_annuler = paiement.subscription_id;

  if nombre_paiements > 0 then
    raise exception
      'Nettoyage arrêté : % paiement(s) sont liés aux abonnements à annuler. Les paiements sont immuables. Annulez-les puis recréez-les dans l’application sur l’abonnement conservé, puis relancez ce script.',
      nombre_paiements;
  end if;
end;
$$;

create temporary table _abonnements_nettoyes (id uuid primary key) on commit drop;

do $$
declare
  cible record;
  gerant_id uuid;
begin
  for cible in
    select plan.abonnement_a_annuler as id, abonnement.gym_id
    from _plan_nettoyage plan
    join public.subscriptions abonnement on abonnement.id = plan.abonnement_a_annuler
    order by abonnement.gym_id, abonnement.member_id, abonnement.section_id, abonnement.start_date
  loop
    select membership.user_id
      into gerant_id
    from public.gym_memberships membership
    where membership.gym_id = cible.gym_id
      and membership.role = 'gerant'
    order by membership.added_at
    limit 1;

    if gerant_id is null then
      raise exception 'Aucun gérant trouvé pour la salle %. Aucune modification ne sera conservée.', cible.gym_id;
    end if;

    perform set_config('request.jwt.claim.sub', gerant_id::text, true);
    update public.subscriptions
    set deleted_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = cible.id
      and deleted_at is null;

    insert into _abonnements_nettoyes (id) values (cible.id);
  end loop;
end;
$$;

select abonnement.id, abonnement.member_id, abonnement.section_id,
       abonnement.start_date, abonnement.end_date, abonnement.deleted_at
from public.subscriptions abonnement
join _abonnements_nettoyes nettoye on nettoye.id = abonnement.id
order by abonnement.id;

rollback;
