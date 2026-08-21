begin;

alter table public.media_assets
  add column created_by uuid references auth.users(id),
  add column updated_at timestamptz;

alter table public.media_assets
  alter column updated_at set default now();

drop trigger if exists media_assets_set_updated_at on public.media_assets;
create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

alter table public.media_assets
  drop constraint media_assets_upload_source_check,
  drop constraint media_assets_portrait_consent_check;

alter table public.media_assets
  add constraint media_assets_upload_source_check check (
    source not in ('supabase_upload', 'cms_draft', 'cms_public')
    or (
      bucket is not null and length(btrim(bucket)) > 0
      and object_path is not null and length(btrim(object_path)) > 0
    )
  ),
  add constraint media_assets_cms_bucket_check check (
    (source <> 'cms_draft' or bucket = 'cms-drafts')
    and (source <> 'cms_public' or bucket = 'cms-public')
  ),
  add constraint media_assets_draft_owner_check check (
    source <> 'cms_draft'
    or (draft_id is not null and published_snapshot_id is null and created_by is not null)
  ),
  add constraint media_assets_portrait_consent_check check (
    (
      rights_status = 'legacy_retained'
      and source = 'github_legacy'
      and contains_portrait is null
      and portrait_consent = 'not_applicable'
    )
    or (
      rights_status <> 'legacy_retained'
      and (
        contains_portrait is null
        or contains_portrait = false
        or portrait_consent in ('confirmed', 'pending')
      )
    )
  );

create unique index media_assets_draft_checksum_idx
  on public.media_assets (content_id, sha256)
  where source = 'cms_draft' and deleted_at is null;

create function public.validate_content_draft_media_refs()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_reference text;
  v_cover text;
  v_gallery jsonb;
  v_missing integer;
  v_new_gallery_count integer;
begin
  v_cover := nullif(new.data ->> 'coverAssetId', '');
  v_gallery := coalesce(new.data -> 'galleryAssetIds', '[]'::jsonb);

  if jsonb_typeof(v_gallery) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid media references';
  end if;

  select count(*) into v_missing
  from (
    select v_cover as reference, 'cover'::text as expected_role where v_cover is not null
    union all
    select jsonb_array_elements_text(v_gallery), 'gallery'::text
  ) refs
  where not exists (
    select 1
    from public.media_assets media
    where media.content_id = new.content_id
      and media.deleted_at is null
      and media.role::text = refs.expected_role
      and (media.id::text = refs.reference or media.legacy_asset_key = refs.reference)
      and (
        media.source = 'github_legacy'
        or (media.source = 'cms_draft' and media.draft_id = new.id)
      )
  );

  if v_missing > 0 then
    raise exception using errcode = '23503', message = 'invalid media references';
  end if;

  select count(*) into v_new_gallery_count
  from jsonb_array_elements_text(v_gallery) refs(reference)
  join public.media_assets media
    on media.id::text = refs.reference
   and media.content_id = new.content_id
   and media.draft_id = new.id
   and media.source = 'cms_draft'
   and media.deleted_at is null;

  if v_new_gallery_count > 20 then
    raise exception using errcode = '22023', message = 'draft gallery upload limit exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists content_drafts_validate_media_refs on public.content_drafts;
create trigger content_drafts_validate_media_refs
before insert or update of data on public.content_drafts
for each row execute function public.validate_content_draft_media_refs();

create function public.save_content_draft_with_media(
  p_draft_id uuid,
  p_data jsonb,
  p_validation_result jsonb,
  p_status public.draft_status,
  p_media_metadata jsonb default '[]'::jsonb
)
returns public.content_drafts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_draft public.content_drafts;
  v_metadata jsonb;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  if jsonb_typeof(p_media_metadata) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid media metadata';
  end if;

  select * into v_draft
  from public.content_drafts
  where id = p_draft_id and created_by = auth.uid()
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'draft not manageable';
  end if;

  for v_metadata in select value from jsonb_array_elements(p_media_metadata)
  loop
    update public.media_assets
    set
      alt_text = left(coalesce(v_metadata ->> 'altText', ''), 500),
      contains_portrait = case v_metadata ->> 'containsPortrait'
        when 'yes' then true when 'no' then false else null end,
      portrait_consent = case v_metadata ->> 'containsPortrait'
        when 'yes' then 'pending'::public.portrait_consent_status
        when 'no' then 'not_applicable'::public.portrait_consent_status
        else 'pending'::public.portrait_consent_status end,
      rights_status = case v_metadata ->> 'rightsStatus'
        when 'owned' then 'owned'::public.media_rights_status
        when 'authorized' then 'authorized'::public.media_rights_status
        else 'unknown'::public.media_rights_status end
    where id = (v_metadata ->> 'id')::uuid
      and content_id = v_draft.content_id
      and draft_id = v_draft.id
      and source = 'cms_draft'
      and created_by = auth.uid()
      and deleted_at is null;
    if not found then
      raise exception using errcode = '42501', message = 'media not manageable';
    end if;
  end loop;

  update public.content_drafts
  set data = p_data,
      validation_result = p_validation_result,
      status = p_status,
      updated_by = auth.uid()
  where id = v_draft.id
  returning * into v_draft;
  return v_draft;
end;
$$;

create function public.delete_unreferenced_draft_media(p_media_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_media public.media_assets;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  select * into v_media from public.media_assets
  where id = p_media_id
    and source = 'cms_draft'
    and created_by = auth.uid()
    and published_snapshot_id is null
  for update;
  if not found then return false; end if;
  if exists (
    select 1 from public.content_drafts draft
    where (draft.data ->> 'coverAssetId') = p_media_id::text
       or (draft.data -> 'galleryAssetIds') ? p_media_id::text
  ) then
    raise exception using errcode = '23503', message = 'media is still referenced';
  end if;
  delete from public.media_assets where id = p_media_id;
  return true;
end;
$$;

drop policy if exists media_assets_select_active_admin on public.media_assets;
drop policy if exists media_assets_insert_active_admin on public.media_assets;
drop policy if exists media_assets_update_active_admin on public.media_assets;

create policy media_assets_select_active_admin on public.media_assets
for select to authenticated
using (
  public.is_active_admin()
  and (source <> 'cms_draft' or created_by = (select auth.uid()))
);

revoke insert, update, delete on table public.media_assets from authenticated;
grant select on table public.media_assets to authenticated;
grant execute on function public.save_content_draft_with_media(uuid, jsonb, jsonb, public.draft_status, jsonb) to authenticated, service_role;
grant execute on function public.delete_unreferenced_draft_media(uuid) to authenticated, service_role;

comment on column public.media_assets.created_by is
  'Required owner for private cms_draft assets; NULL for untouched legacy baseline rows.';
comment on column public.media_assets.updated_at is
  'NULL for untouched legacy rows; cms_draft rows receive creation time and update trigger timestamps.';
comment on function public.save_content_draft_with_media is
  'Atomically saves canonical draft references and editable metadata; immutable media fields are never browser-writable.';

commit;
