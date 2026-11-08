-- Supprime uniquement les données explicitement marquées [DÉMO].
-- Les paiements et abonnements sont retrouvés par les membres marqués.
begin;

do $$
declare
  paiements_supprimes integer;
  abonnements_supprimes integer;
  membres_supprimes integer;
  depenses_supprimees integer;
begin
  delete from public.payments as payment
  using public.members as member
  where payment.member_id = member.id
    and left(coalesce(member.notes, ''), length('[DÉMO]')) = '[DÉMO]';
  get diagnostics paiements_supprimes = row_count;

  delete from public.subscriptions as subscription
  using public.members as member
  where subscription.member_id = member.id
    and left(coalesce(member.notes, ''), length('[DÉMO]')) = '[DÉMO]';
  get diagnostics abonnements_supprimes = row_count;

  delete from public.members
  where left(coalesce(notes, ''), length('[DÉMO]')) = '[DÉMO]';
  get diagnostics membres_supprimes = row_count;

  delete from public.expenses
  where left(label, length('[DÉMO]')) = '[DÉMO]';
  get diagnostics depenses_supprimees = row_count;

  raise notice 'Nettoyage terminé : % paiements, % abonnements, % membres et % dépenses de démonstration supprimés.',
    paiements_supprimes, abonnements_supprimes, membres_supprimes, depenses_supprimees;
end;
$$;

commit;
