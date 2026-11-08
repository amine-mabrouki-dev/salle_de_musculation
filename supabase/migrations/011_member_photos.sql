-- Photos de profil des membres, conservées dans un bucket privé.

alter table public.members
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg'];

drop policy if exists "Chaque gérant lit ses photos de membres" on storage.objects;
create policy "Chaque gérant lit ses photos de membres"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Chaque gérant enregistre ses photos de membres" on storage.objects;
create policy "Chaque gérant enregistre ses photos de membres"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Chaque gérant modifie ses photos de membres" on storage.objects;
create policy "Chaque gérant modifie ses photos de membres"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Chaque gérant supprime ses photos de membres" on storage.objects;
create policy "Chaque gérant supprime ses photos de membres"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
