-- Renomme l’activité historique Femme/Femmes sans changer les identifiants
-- de section ni ceux des abonnements, membres, paiements et dépenses.
-- Le tarif enfant reprend les montants validés : 35 DT/mois et 320 DT/an.
-- Les tarifs enfant déjà configurés ne sont pas écrasés.

begin;

do $$
begin
  if exists (
    select 1
    from public.sections ancienne
    join public.sections fitness
      on fitness.gym_id = ancienne.gym_id
     and fitness.id <> ancienne.id
    where lower(trim(ancienne.name)) in ('femme', 'femmes')
      and lower(trim(fitness.name)) in ('femme', 'femmes', 'fitness')
  ) then
    raise exception
      'Migration arrêtée : une salle possède plusieurs sections Femme/Femmes/Fitness. Examinez ces sections avant de relancer la migration afin de conserver toutes les données.';
  end if;

  update public.sections
  set name = 'Fitness',
      updated_at = clock_timestamp()
  where lower(trim(name)) in ('femme', 'femmes');

  -- Cette migration est exécutée comme opération administrative, sans JWT
  -- utilisateur : le trigger d’attribution ne peut donc pas résoudre auth.uid().
  -- La transaction et le verrou ALTER TABLE encadrent la désactivation ciblée.
  alter table public.tariffs disable trigger tariffs_attribution;

  insert into public.tariffs (
    gym_id,
    section_id,
    category,
    monthly_price,
    annual_price
  )
  select section.gym_id, section.id, 'etudiant_enfant', 35, 320
  from public.sections section
  where lower(trim(section.name)) = 'fitness'
  on conflict (section_id, category) do nothing;

  alter table public.tariffs enable trigger tariffs_attribution;
end;
$$;

commit;
