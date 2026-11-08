-- Diagnostic strictement en lecture seule.
-- end_date est inclusif : une période finissant le 12 ne chevauche pas celle qui commence le 13.

select
  a.id as abonnement_a,
  b.id as abonnement_b,
  a.member_id,
  a.section_id,
  a.start_date as debut_a,
  a.end_date as fin_a,
  b.start_date as debut_b,
  b.end_date as fin_b
from public.subscriptions a
join public.subscriptions b
  on a.member_id = b.member_id
 and a.section_id = b.section_id
 and a.id < b.id
 and daterange(a.start_date, a.end_date, '[]')
     && daterange(b.start_date, b.end_date, '[]')
where a.deleted_at is null
  and b.deleted_at is null
order by a.member_id, a.section_id, a.start_date, b.start_date;
