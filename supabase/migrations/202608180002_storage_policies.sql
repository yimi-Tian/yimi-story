begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'cms-drafts',
    'cms-drafts',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'cms-public',
    'cms-public',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy cms_drafts_select_own_active_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'cms-drafts'
  and public.is_active_admin()
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy cms_drafts_insert_own_active_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cms-drafts'
  and public.is_active_admin()
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy cms_drafts_update_own_active_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'cms-drafts'
  and public.is_active_admin()
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'cms-drafts'
  and public.is_active_admin()
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- V1 permits physical deletion only for objects under the active admin's own
-- draft prefix. The related media_assets record remains a soft-delete model.
create policy cms_drafts_delete_own_active_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'cms-drafts'
  and public.is_active_admin()
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- cms-public is public-read. No browser-role INSERT, UPDATE, or DELETE policy
-- exists; trusted service_role publishing bypasses RLS.
create policy cms_public_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'cms-public');

commit;
