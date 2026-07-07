-- Run this once in Supabase SQL Editor.
-- It creates the public Storage bucket used by mistake image uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mistake-images',
  'mistake-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mistake images public read" on storage.objects;
create policy "mistake images public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'mistake-images');

drop policy if exists "mistake images anon upload" on storage.objects;
create policy "mistake images anon upload"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'mistake-images');

drop policy if exists "mistake images anon update" on storage.objects;
create policy "mistake images anon update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'mistake-images')
with check (bucket_id = 'mistake-images');

drop policy if exists "mistake images anon delete" on storage.objects;
create policy "mistake images anon delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'mistake-images');
