begin;

alter table public.media_assets
  add column original_media_id uuid,
  add column transformation jsonb;

alter table public.media_assets
  add constraint media_assets_original_media_id_fkey
    foreign key (original_media_id) references public.media_assets(id) on delete restrict,
  add constraint media_assets_derived_shape_check check (
    (
      original_media_id is null
      and transformation is null
    )
    or (
      source = 'cms_draft'
      and original_media_id is not null
      and original_media_id <> id
      and jsonb_typeof(transformation) = 'object'
      and transformation -> 'normalizedOrientation' = 'true'::jsonb
      and jsonb_typeof(transformation -> 'rotation') = 'number'
      and (transformation ->> 'rotation')::integer in (0, 90, 180, 270)
      and jsonb_typeof(transformation -> 'crop') = 'object'
    )
  );

create index media_assets_original_media_id_idx
  on public.media_assets (original_media_id)
  where original_media_id is not null and deleted_at is null;

create function public.attach_derived_draft_media(
  p_draft_id uuid,
  p_current_media_id uuid,
  p_derived_media_id uuid
)
returns public.content_drafts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_draft public.content_drafts;
  v_current public.media_assets;
  v_derived public.media_assets;
  v_original public.media_assets;
  v_gallery jsonb;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;

  select * into v_draft
  from public.content_drafts
  where id = p_draft_id and created_by = auth.uid()
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'draft not manageable';
  end if;

  select * into v_current
  from public.media_assets
  where id = p_current_media_id
    and content_id = v_draft.content_id
    and draft_id = v_draft.id
    and source = 'cms_draft'
    and created_by = auth.uid()
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'source media not manageable';
  end if;

  select * into v_derived
  from public.media_assets
  where id = p_derived_media_id
    and content_id = v_draft.content_id
    and draft_id = v_draft.id
    and source = 'cms_draft'
    and created_by = auth.uid()
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'derived media not manageable';
  end if;

  if v_derived.role <> v_current.role
    or v_derived.original_media_id is null
    or v_derived.original_media_id <> coalesce(v_current.original_media_id, v_current.id)
    or v_derived.transformation is null
  then
    raise exception using errcode = '23514', message = 'invalid derived media relationship';
  end if;

  select * into v_original
  from public.media_assets
  where id = v_derived.original_media_id
    and content_id = v_draft.content_id
    and draft_id = v_draft.id
    and source = 'cms_draft'
    and created_by = auth.uid()
    and original_media_id is null
    and deleted_at is null;
  if not found then
    raise exception using errcode = '23514', message = 'original media not manageable';
  end if;

  if v_current.role = 'cover' and v_draft.data ->> 'coverAssetId' = v_current.id::text then
    v_draft.data := jsonb_set(v_draft.data, '{coverAssetId}', to_jsonb(v_derived.id::text), true);
  elsif v_current.role = 'gallery' and (v_draft.data -> 'galleryAssetIds') ? v_current.id::text then
    select coalesce(jsonb_agg(
      to_jsonb(case when item.value = v_current.id::text then v_derived.id::text else item.value end)
      order by item.ordinality
    ), '[]'::jsonb)
    into v_gallery
    from jsonb_array_elements_text(coalesce(v_draft.data -> 'galleryAssetIds', '[]'::jsonb))
      with ordinality as item(value, ordinality);
    v_draft.data := jsonb_set(v_draft.data, '{galleryAssetIds}', v_gallery, true);
  else
    raise exception using errcode = '23503', message = 'source media is not referenced by draft';
  end if;

  update public.content_drafts
  set data = v_draft.data,
      status = 'draft',
      validation_result = jsonb_set(coalesce(validation_result, '{}'::jsonb), '{valid}', 'false'::jsonb, true),
      updated_by = auth.uid()
  where id = v_draft.id
  returning * into v_draft;

  return v_draft;
end;
$$;

create function public.restore_original_draft_media(
  p_draft_id uuid,
  p_current_media_id uuid
)
returns public.content_drafts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_draft public.content_drafts;
  v_current public.media_assets;
  v_original public.media_assets;
  v_gallery jsonb;
begin
  if not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;

  select * into v_draft
  from public.content_drafts
  where id = p_draft_id and created_by = auth.uid()
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'draft not manageable';
  end if;

  select * into v_current
  from public.media_assets
  where id = p_current_media_id
    and content_id = v_draft.content_id
    and draft_id = v_draft.id
    and source = 'cms_draft'
    and created_by = auth.uid()
    and original_media_id is not null
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'edited media not manageable';
  end if;

  select * into v_original
  from public.media_assets
  where id = v_current.original_media_id
    and content_id = v_draft.content_id
    and draft_id = v_draft.id
    and source = 'cms_draft'
    and created_by = auth.uid()
    and original_media_id is null
    and role = v_current.role
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'original media not manageable';
  end if;

  if v_current.role = 'cover' and v_draft.data ->> 'coverAssetId' = v_current.id::text then
    v_draft.data := jsonb_set(v_draft.data, '{coverAssetId}', to_jsonb(v_original.id::text), true);
  elsif v_current.role = 'gallery' and (v_draft.data -> 'galleryAssetIds') ? v_current.id::text then
    select coalesce(jsonb_agg(
      to_jsonb(case when item.value = v_current.id::text then v_original.id::text else item.value end)
      order by item.ordinality
    ), '[]'::jsonb)
    into v_gallery
    from jsonb_array_elements_text(coalesce(v_draft.data -> 'galleryAssetIds', '[]'::jsonb))
      with ordinality as item(value, ordinality);
    v_draft.data := jsonb_set(v_draft.data, '{galleryAssetIds}', v_gallery, true);
  else
    raise exception using errcode = '23503', message = 'edited media is not referenced by draft';
  end if;

  update public.content_drafts
  set data = v_draft.data,
      status = 'draft',
      validation_result = jsonb_set(coalesce(validation_result, '{}'::jsonb), '{valid}', 'false'::jsonb, true),
      updated_by = auth.uid()
  where id = v_draft.id
  returning * into v_draft;

  return v_draft;
end;
$$;

create or replace function public.delete_unreferenced_draft_media(p_media_id uuid)
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
  if exists (
    select 1 from public.media_assets child
    where child.original_media_id = p_media_id
      and child.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'original media has edited versions';
  end if;
  delete from public.media_assets where id = p_media_id;
  return true;
end;
$$;

revoke all on function public.attach_derived_draft_media(uuid, uuid, uuid) from public, anon;
revoke all on function public.restore_original_draft_media(uuid, uuid) from public, anon;
grant execute on function public.attach_derived_draft_media(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.restore_original_draft_media(uuid, uuid) to authenticated, service_role;

comment on column public.media_assets.original_media_id is
  'Root cms_draft upload retained for restore; edited versions point directly to the root and never form a deep chain.';
comment on column public.media_assets.transformation is
  'Normalized rotate/crop recipe for an edited private draft image; never stores Canvas or signed URL state.';
comment on function public.attach_derived_draft_media is
  'Atomically replaces one draft media reference with a validated edited version and increments the draft revision.';
comment on function public.restore_original_draft_media is
  'Atomically restores the root private draft image while preserving gallery order and incrementing the draft revision.';

commit;
