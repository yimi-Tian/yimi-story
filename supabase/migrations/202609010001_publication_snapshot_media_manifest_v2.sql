begin;

create or replace function public.prepare_publication_snapshot(
  p_actor_id uuid,
  p_draft_id uuid,
  p_expected_revision integer,
  p_schema_version text,
  p_public_data jsonb,
  p_media_manifest jsonb,
  p_publication_validation jsonb,
  p_expected_checksum text
)
returns public.publication_snapshots
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_draft public.content_drafts;
  v_item public.content_items;
  v_snapshot public.publication_snapshots;
  v_expected_public jsonb;
  v_expected_manifest jsonb;
  v_checksum text;
  v_cover text;
  v_gallery jsonb;
  v_reference_count integer;
  v_media_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if not exists (
    select 1 from public.admin_users
    where user_id = p_actor_id and is_active = true
  ) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;

  select * into v_draft
  from public.content_drafts
  where id = p_draft_id and created_by = p_actor_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'draft not manageable';
  end if;
  if v_draft.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'draft revision changed';
  end if;
  if v_draft.status <> 'validated'
    or v_draft.validation_result ->> 'valid' <> 'true'
    or jsonb_array_length(coalesce(v_draft.validation_result -> 'errors', '[]'::jsonb)) <> 0
  then
    raise exception using errcode = '23514', message = 'validated draft required';
  end if;
  if p_publication_validation ->> 'valid' <> 'true'
    or (p_publication_validation ->> 'revision')::integer <> v_draft.revision
    or jsonb_array_length(coalesce(p_publication_validation -> 'errors', '[]'::jsonb)) <> 0
  then
    raise exception using errcode = '23514', message = 'current publication validation required';
  end if;

  select * into v_item from public.content_items where id = v_draft.content_id;
  if not found then
    raise exception using errcode = '23503', message = 'content not found';
  end if;

  v_expected_public := v_draft.data - 'internalNotes';
  if v_item.content_type = 'activity' and nullif(v_draft.data ->> 'startDate', '') is not null then
    v_expected_public := jsonb_set(
      v_expected_public,
      '{dateLabel}',
      to_jsonb(
        case
          when nullif(v_draft.data ->> 'endDate', '') is null
            or v_draft.data ->> 'endDate' = v_draft.data ->> 'startDate'
            then ((v_draft.data ->> 'startDate')::date)::text
          when left(v_draft.data ->> 'startDate', 4) = left(v_draft.data ->> 'endDate', 4)
            then extract(month from (v_draft.data ->> 'startDate')::date)::integer::text || '/' || extract(day from (v_draft.data ->> 'startDate')::date)::integer::text || '～' || extract(month from (v_draft.data ->> 'endDate')::date)::integer::text || '/' || extract(day from (v_draft.data ->> 'endDate')::date)::integer::text
          else extract(year from (v_draft.data ->> 'startDate')::date)::integer::text || '/' || extract(month from (v_draft.data ->> 'startDate')::date)::integer::text || '/' || extract(day from (v_draft.data ->> 'startDate')::date)::integer::text || '～' || extract(year from (v_draft.data ->> 'endDate')::date)::integer::text || '/' || extract(month from (v_draft.data ->> 'endDate')::date)::integer::text || '/' || extract(day from (v_draft.data ->> 'endDate')::date)::integer::text
        end
      ),
      true
    );
  end if;
  if v_item.content_type = 'activity' and nullif(v_draft.data ->> 'startDate', '') is not null
    and (v_draft.data ->> 'endDate' is null or v_draft.data ->> 'endDate' = v_draft.data ->> 'startDate')
  then
    v_expected_public := jsonb_set(v_expected_public, '{dateLabel}', to_jsonb(
      extract(month from (v_draft.data ->> 'startDate')::date)::integer::text || '/' ||
      extract(day from (v_draft.data ->> 'startDate')::date)::integer::text
    ), true);
  end if;
  if p_public_data is distinct from v_expected_public
    or jsonb_path_exists(p_public_data, '$.**.internalNotes')
  then
    raise exception using errcode = '23514', message = 'public projection mismatch';
  end if;

  v_cover := nullif(v_draft.data ->> 'coverAssetId', '');
  v_gallery := coalesce(v_draft.data -> 'galleryAssetIds', '[]'::jsonb);
  select (case when v_cover is null then 0 else 1 end) + jsonb_array_length(v_gallery)
    into v_reference_count;

  with ordered_refs as (
    select v_cover as reference, 'cover'::text as role, 0::bigint as ordinal
    where v_cover is not null
    union all
    select value, 'gallery'::text, ordinality
    from jsonb_array_elements_text(v_gallery) with ordinality
  ), resolved as (
    select refs.ordinal, media.id, media.role::text as role, media.source::text as source,
      media.sha256, media.legacy_asset_key, media.legacy_path, media.bucket,
      media.object_path, media.original_media_id, media.mime_type, media.extension,
      media.byte_size, media.width, media.height, media.alt_text, media.caption,
      media.credit, media.rights_status::text as rights_status,
      media.contains_portrait, media.portrait_consent::text as portrait_consent,
      media.upload_status::text as upload_status
    from ordered_refs refs
    join public.media_assets media
      on media.content_id = v_draft.content_id
     and media.deleted_at is null
     and media.role::text = refs.role
     and (media.id::text = refs.reference or media.legacy_asset_key = refs.reference)
     and (
       media.source = 'github_legacy'
       or (media.source = 'cms_draft' and media.draft_id = v_draft.id and media.created_by = p_actor_id)
     )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(legacy_asset_key, id::text),
      'mediaId', id::text,
      'role', role,
      'sortOrder', ordinal,
      'source', source,
      'sha256', sha256,
      'legacyPath', legacy_path,
      'bucket', bucket,
      'objectPath', object_path,
      'originalMediaId', original_media_id,
      'mimeType', mime_type,
      'extension', extension,
      'byteSize', byte_size,
      'width', width,
      'height', height,
      'altText', alt_text,
      'caption', caption,
      'credit', credit,
      'rightsStatus', rights_status,
      'containsPortrait', contains_portrait,
      'portraitConsent', portrait_consent,
      'uploadStatus', upload_status
    ) order by case role when 'cover' then 0 else 1 end, ordinal), '[]'::jsonb), count(*)::integer
  into v_expected_manifest, v_media_count
  from resolved;

  if v_media_count <> v_reference_count or p_media_manifest is distinct from v_expected_manifest then
    raise exception using errcode = '23503', message = 'media manifest mismatch';
  end if;

  v_checksum := public.publication_snapshot_checksum(
    p_schema_version, p_public_data, p_media_manifest, p_expected_revision
  );
  if v_checksum <> p_expected_checksum then
    raise exception using errcode = '23514', message = 'publication checksum mismatch';
  end if;

  select * into v_snapshot
  from public.publication_snapshots
  where content_id = v_draft.content_id
    and source_draft_id = v_draft.id
    and source_revision = v_draft.revision
    and checksum_sha256 = v_checksum
    and snapshot_source = 'draft';
  if found then return v_snapshot; end if;

  insert into public.publication_snapshots (
    content_id, source_draft_id, source_revision, schema_version,
    snapshot_data, public_data, media_manifest, publication_validation,
    checksum_sha256, status, created_by, snapshot_source
  ) values (
    v_draft.content_id, v_draft.id, v_draft.revision, p_schema_version,
    v_draft.data, p_public_data, p_media_manifest, p_publication_validation,
    v_checksum, 'ready', p_actor_id, 'draft'
  )
  returning * into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.prepare_publication_snapshot(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.prepare_publication_snapshot(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) to service_role;

comment on function public.prepare_publication_snapshot is
  'Service-role-only transactional preparation with authoritative frozen media manifest metadata. It never changes published_snapshot_id, drafts, media, Storage, or GitHub state.';

commit;
