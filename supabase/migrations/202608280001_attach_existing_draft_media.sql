begin;

create function public.attach_existing_draft_media(
  p_draft_id uuid,
  p_media_id uuid
)
returns public.content_drafts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_draft public.content_drafts;
  v_media public.media_assets;
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

  select * into v_media
  from public.media_assets
  where id = p_media_id
    and content_id = v_draft.content_id
    and draft_id = v_draft.id
    and source = 'cms_draft'
    and original_media_id is null
    and transformation is null
    and upload_status = 'ready'
    and created_by = auth.uid()
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'original media not manageable';
  end if;

  if v_media.role = 'cover' then
    if v_draft.data ->> 'coverAssetId' = v_media.id::text then
      raise exception using errcode = '23505', message = 'media already attached';
    end if;
    v_draft.data := jsonb_set(v_draft.data, '{coverAssetId}', to_jsonb(v_media.id::text), true);
  elsif v_media.role = 'gallery' then
    v_gallery := coalesce(v_draft.data -> 'galleryAssetIds', '[]'::jsonb);
    if v_gallery ? v_media.id::text then
      raise exception using errcode = '23505', message = 'media already attached';
    end if;
    if jsonb_array_length(v_gallery) >= 20 then
      raise exception using errcode = '23514', message = 'gallery limit exceeded';
    end if;
    v_draft.data := jsonb_set(v_draft.data, '{galleryAssetIds}', v_gallery || to_jsonb(v_media.id::text), true);
  else
    raise exception using errcode = '23514', message = 'unsupported media role';
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

revoke all on function public.attach_existing_draft_media(uuid, uuid) from public, anon;
grant execute on function public.attach_existing_draft_media(uuid, uuid) to authenticated, service_role;

comment on function public.attach_existing_draft_media is
  'Atomically attaches one validated root cms_draft upload already owned by the same draft; never accepts derived or cross-content media.';

commit;
