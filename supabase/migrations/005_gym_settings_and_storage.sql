-- Préférences du gérant et photo de fond privée dans Supabase Storage.

create table if not exists public.gym_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reminder_message text not null
    default 'Bonjour {nom}, votre abonnement a expiré le {expiration}. Il reste {reste_a_payer} DT à régler. N’hésitez pas à nous contacter pour le renouveler. Merci et à bientôt à la salle de Moularès.',
  updated_at timestamptz not null default now(),
  check (char_length(reminder_message) between 1 and 1000)
);

alter table public.gym_settings enable row level security;

drop policy if exists "Chaque utilisateur gère ses réglages" on public.gym_settings;
create policy "Chaque utilisateur gère ses réglages"
  on public.gym_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.gym_settings from anon, authenticated;
grant select, insert, update on table public.gym_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-backgrounds', 'gym-backgrounds', false, 5242880, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg'];

drop policy if exists "Chaque gérant lit sa photo de fond" on storage.objects;
create policy "Chaque gérant lit sa photo de fond"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'gym-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Chaque gérant enregistre sa photo de fond" on storage.objects;
create policy "Chaque gérant enregistre sa photo de fond"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gym-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Chaque gérant modifie sa photo de fond" on storage.objects;
create policy "Chaque gérant modifie sa photo de fond"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'gym-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'gym-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Chaque gérant supprime sa photo de fond" on storage.objects;
create policy "Chaque gérant supprime sa photo de fond"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'gym-backgrounds'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
