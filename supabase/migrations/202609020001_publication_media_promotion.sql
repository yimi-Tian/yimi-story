begin;

create type public.publication_media_preparation_status as enum (
  'preparing',
  'ready',
  'failed'
);

alter table public.media_assets
  add column publication_source_media_id uuid references public.media_assets(id) on delete restrict,
  add column publication_source_sha256 text;

alter table public.media_assets
  add constraint media_assets_public_source_check check (
    source <> 'cms_public'
    or (
      draft_id is null
      and published_snapshot_id is not null
      and publication_source_media_id is not null
      and publication_source_sha256 ~ '^[0-9a-f]{64}$'
      and upload_status = 'ready'
    )
  );

create unique index media_assets_public_source_identity_idx
  on public.media_assets (content_id, publication_source_media_id, publication_source_sha256)
  where source = 'cms_public' and deleted_at is null;

create unique index media_assets_public_object_path_idx
  on public.media_assets (object_path)
  where source = 'cms_public' and deleted_at is null;

create table public.publication_media_preparations (
  publication_snapshot_id uuid primary key references public.publication_snapshots(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  status public.publication_media_preparation_status not null default 'preparing',
  required_count integer not null default 0 check (required_count >= 0),
  promoted_count integer not null default 0 check (promoted_count >= 0),
  legacy_count integer not null default 0 check (legacy_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  public_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(public_manifest) = 'array'),
  manifest_checksum_sha256 text check (manifest_checksum_sha256 is null or manifest_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  error_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_media_preparation_ready_check check (
    status <> 'ready'
    or (failed_count = 0 and manifest_checksum_sha256 is not null)
  )
);

create table public.publication_media_mappings (
  id uuid primary key default gen_random_uuid(),
  publication_snapshot_id uuid not null references public.publication_snapshots(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  source_media_id uuid not null references public.media_assets(id) on delete restrict,
  public_media_id uuid references public.media_assets(id) on delete restrict,
  role public.media_role not null,
  position integer not null check (position >= 0),
  source_type public.media_source not null,
  source_checksum_sha256 text check (source_checksum_sha256 is null or source_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  public_checksum_sha256 text check (public_checksum_sha256 is null or public_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  public_path text not null check (length(btrim(public_path)) > 0),
  frozen_metadata jsonb not null check (jsonb_typeof(frozen_metadata) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint publication_media_mapping_source_check check (
    (source_type = 'github_legacy' and public_media_id is null)
    or (source_type = 'cms_draft' and public_media_id is not null)
  ),
  constraint publication_media_mapping_checksum_check check (
    source_type = 'github_legacy'
    or source_checksum_sha256 = public_checksum_sha256
  ),
  unique (publication_snapshot_id, role, position)
);

create index publication_media_mappings_snapshot_idx
  on public.publication_media_mappings (publication_snapshot_id, role, position);
create index publication_media_mappings_public_media_idx
  on public.publication_media_mappings (public_media_id)
  where public_media_id is not null;

create trigger publication_media_preparations_set_updated_at
before update on public.publication_media_preparations
for each row execute function public.set_updated_at();

alter table public.publication_media_preparations enable row level security;
alter table public.publication_media_mappings enable row level security;

create policy publication_media_preparations_select_active_admin
on public.publication_media_preparations
for select to authenticated
using (public.is_active_admin());

create policy publication_media_mappings_select_active_admin
on public.publication_media_mappings
for select to authenticated
using (public.is_active_admin());

revoke insert, update, delete on table public.publication_media_preparations from authenticated;
revoke insert, update, delete on table public.publication_media_mappings from authenticated;
grant select on table public.publication_media_preparations to authenticated, service_role;
grant select on table public.publication_media_mappings to authenticated, service_role;
grant all on table public.publication_media_preparations to service_role;
grant all on table public.publication_media_mappings to service_role;
grant usage on type public.publication_media_preparation_status to authenticated, service_role;

create function public.begin_publication_media_preparation(
  p_actor_id uuid,
  p_snapshot_id uuid
)
returns public.publication_media_preparations
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_snapshot public.publication_snapshots;
  v_result public.publication_media_preparations;
  v_required integer;
  v_legacy integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active = true) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;

  select * into v_snapshot from public.publication_snapshots where id = p_snapshot_id;
  if not found then raise exception using errcode = 'P0002', message = 'snapshot not found'; end if;
  if v_snapshot.schema_version <> '1.1'
    or v_snapshot.snapshot_source <> 'draft'
    or v_snapshot.status <> 'ready'
    or v_snapshot.publication_validation ->> 'valid' <> 'true'
  then
    raise exception using errcode = '23514', message = 'snapshot not eligible';
  end if;
  if jsonb_typeof(v_snapshot.media_manifest) <> 'array' then
    raise exception using errcode = '23514', message = 'snapshot manifest invalid';
  end if;

  select count(distinct entry ->> 'mediaId') filter (where entry ->> 'source' = 'cms_draft'),
    count(*) filter (where entry ->> 'source' = 'github_legacy')
  into v_required, v_legacy
  from jsonb_array_elements(v_snapshot.media_manifest) entry;

  insert into public.publication_media_preparations (
    publication_snapshot_id, content_id, status, required_count, promoted_count,
    legacy_count, failed_count, public_manifest, manifest_checksum_sha256,
    error_code, created_by
  ) values (
    v_snapshot.id, v_snapshot.content_id, 'preparing', coalesce(v_required, 0), 0,
    coalesce(v_legacy, 0), 0, '[]'::jsonb, null, null, p_actor_id
  )
  on conflict (publication_snapshot_id) do update set
    status = case when publication_media_preparations.status = 'ready' then 'ready'::public.publication_media_preparation_status else 'preparing'::public.publication_media_preparation_status end,
    required_count = excluded.required_count,
    legacy_count = excluded.legacy_count,
    failed_count = case when publication_media_preparations.status = 'ready' then publication_media_preparations.failed_count else 0 end,
    error_code = case when publication_media_preparations.status = 'ready' then publication_media_preparations.error_code else null end
  returning * into v_result;

  return v_result;
end;
$$;

create function public.register_publication_media_asset(
  p_actor_id uuid,
  p_snapshot_id uuid,
  p_source_media_id uuid,
  p_public_media_id uuid,
  p_public_object_path text,
  p_public_checksum_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_snapshot public.publication_snapshots;
  v_entry jsonb;
  v_public public.media_assets;
  v_created boolean := false;
  v_expected_path text;
  v_mapping public.publication_media_mappings;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active = true) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  select * into v_snapshot from public.publication_snapshots where id = p_snapshot_id;
  if not found or v_snapshot.schema_version <> '1.1' or v_snapshot.snapshot_source <> 'draft' or v_snapshot.status <> 'ready' then
    raise exception using errcode = '23514', message = 'snapshot not eligible';
  end if;
  if not exists (select 1 from public.publication_media_preparations where publication_snapshot_id = p_snapshot_id) then
    raise exception using errcode = '23514', message = 'media preparation not started';
  end if;

  select entry into v_entry
  from jsonb_array_elements(v_snapshot.media_manifest) entry
  where entry ->> 'source' = 'cms_draft' and entry ->> 'mediaId' = p_source_media_id::text
  order by case entry ->> 'role' when 'cover' then 0 else 1 end, (entry ->> 'sortOrder')::integer
  limit 1;
  if v_entry is null then raise exception using errcode = '23503', message = 'source media not in snapshot'; end if;
  if v_entry ->> 'sha256' is distinct from p_public_checksum_sha256 then
    raise exception using errcode = '23514', message = 'public checksum mismatch';
  end if;
  if not exists (
    select 1 from public.media_assets source
    where source.id = p_source_media_id
      and source.content_id = v_snapshot.content_id
      and source.source = 'cms_draft'
      and source.bucket is not distinct from v_entry ->> 'bucket'
      and source.object_path is not distinct from v_entry ->> 'objectPath'
      and source.sha256 is not distinct from v_entry ->> 'sha256'
      and source.upload_status = 'ready'
      and source.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'source media identity mismatch';
  end if;
  v_expected_path := 'content/' || v_snapshot.content_id::text || '/' || p_source_media_id::text || '/' ||
    (v_entry ->> 'sha256') || '.' || (v_entry ->> 'extension');
  if p_public_object_path is distinct from v_expected_path then
    raise exception using errcode = '23514', message = 'public object path mismatch';
  end if;

  select * into v_public from public.media_assets
  where content_id = v_snapshot.content_id
    and source = 'cms_public'
    and publication_source_media_id = p_source_media_id
    and publication_source_sha256 = v_entry ->> 'sha256'
    and deleted_at is null;

  if found then
    if v_public.object_path is distinct from v_expected_path
      or v_public.sha256 is distinct from v_entry ->> 'sha256'
      or v_public.mime_type is distinct from v_entry ->> 'mimeType'
      or v_public.extension is distinct from v_entry ->> 'extension'
      or v_public.byte_size is distinct from (v_entry ->> 'byteSize')::bigint
      or v_public.width is distinct from (v_entry ->> 'width')::integer
      or v_public.height is distinct from (v_entry ->> 'height')::integer
    then
      raise exception using errcode = '23514', message = 'public media conflict';
    end if;
  else
    insert into public.media_assets (
      id, content_id, draft_id, source, role, sort_order, bucket, object_path,
      original_filename, mime_type, extension, byte_size, width, height, sha256,
      alt_text, caption, credit, rights_status, contains_portrait, portrait_consent,
      upload_status, created_by, published_snapshot_id,
      publication_source_media_id, publication_source_sha256
    ) values (
      p_public_media_id, v_snapshot.content_id, null, 'cms_public',
      (v_entry ->> 'role')::public.media_role, (v_entry ->> 'sortOrder')::integer,
      'cms-public', v_expected_path,
      p_source_media_id::text || '.' || (v_entry ->> 'extension'),
      v_entry ->> 'mimeType', v_entry ->> 'extension', (v_entry ->> 'byteSize')::bigint,
      (v_entry ->> 'width')::integer, (v_entry ->> 'height')::integer,
      v_entry ->> 'sha256', coalesce(v_entry ->> 'altText', ''),
      v_entry ->> 'caption', v_entry ->> 'credit',
      (v_entry ->> 'rightsStatus')::public.media_rights_status,
      (v_entry ->> 'containsPortrait')::boolean,
      (v_entry ->> 'portraitConsent')::public.portrait_consent_status,
      'ready', p_actor_id, v_snapshot.id, p_source_media_id, v_entry ->> 'sha256'
    ) returning * into v_public;
    v_created := true;
  end if;

  for v_entry in
    select entry from jsonb_array_elements(v_snapshot.media_manifest) entry
    where entry ->> 'source' = 'cms_draft' and entry ->> 'mediaId' = p_source_media_id::text
  loop
    insert into public.publication_media_mappings (
      publication_snapshot_id, content_id, source_media_id, public_media_id,
      role, position, source_type, source_checksum_sha256,
      public_checksum_sha256, public_path, frozen_metadata, created_by
    ) values (
      v_snapshot.id, v_snapshot.content_id, p_source_media_id, v_public.id,
      (v_entry ->> 'role')::public.media_role, (v_entry ->> 'sortOrder')::integer,
      'cms_draft', v_entry ->> 'sha256', v_entry ->> 'sha256',
      v_expected_path, v_entry, p_actor_id
    )
    on conflict (publication_snapshot_id, role, position) do nothing;

    select * into v_mapping from public.publication_media_mappings
    where publication_snapshot_id = v_snapshot.id
      and role = (v_entry ->> 'role')::public.media_role
      and position = (v_entry ->> 'sortOrder')::integer;
    if v_mapping.source_media_id <> p_source_media_id
      or v_mapping.public_media_id <> v_public.id
      or v_mapping.source_checksum_sha256 is distinct from v_entry ->> 'sha256'
      or v_mapping.public_path is distinct from v_expected_path
      or v_mapping.frozen_metadata is distinct from v_entry
    then
      raise exception using errcode = '23514', message = 'publication mapping conflict';
    end if;
  end loop;

  update public.publication_media_preparations set
    promoted_count = (
      select count(distinct public_media_id)::integer from public.publication_media_mappings
      where publication_snapshot_id = v_snapshot.id and source_type = 'cms_draft'
    ),
    status = 'preparing', error_code = null, failed_count = 0
  where publication_snapshot_id = v_snapshot.id and status <> 'ready';

  return jsonb_build_object('publicMediaId', v_public.id, 'created', v_created, 'objectPath', v_expected_path);
end;
$$;

create function public.finalize_publication_media_preparation(
  p_actor_id uuid,
  p_snapshot_id uuid
)
returns public.publication_media_preparations
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_snapshot public.publication_snapshots;
  v_entry jsonb;
  v_media_id uuid;
  v_mapping public.publication_media_mappings;
  v_expected integer;
  v_actual integer;
  v_public_manifest jsonb;
  v_result public.publication_media_preparations;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active = true) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  select * into v_snapshot from public.publication_snapshots where id = p_snapshot_id;
  if not found or v_snapshot.schema_version <> '1.1' or v_snapshot.snapshot_source <> 'draft' or v_snapshot.status <> 'ready' then
    raise exception using errcode = '23514', message = 'snapshot not eligible';
  end if;

  for v_entry in select entry from jsonb_array_elements(v_snapshot.media_manifest) entry
    where entry ->> 'source' = 'github_legacy'
  loop
    v_media_id := (v_entry ->> 'mediaId')::uuid;
    if nullif(v_entry ->> 'legacyPath', '') is null then
      raise exception using errcode = '23514', message = 'legacy public path missing';
    end if;
    if not exists (
      select 1 from public.media_assets legacy
      where legacy.id = v_media_id
        and legacy.content_id = v_snapshot.content_id
        and legacy.source = 'github_legacy'
        and legacy.legacy_path is not distinct from v_entry ->> 'legacyPath'
        and legacy.deleted_at is null
    ) then
      raise exception using errcode = '23503', message = 'legacy media identity mismatch';
    end if;
    insert into public.publication_media_mappings (
      publication_snapshot_id, content_id, source_media_id, public_media_id,
      role, position, source_type, source_checksum_sha256,
      public_checksum_sha256, public_path, frozen_metadata, created_by
    ) values (
      v_snapshot.id, v_snapshot.content_id, v_media_id, null,
      (v_entry ->> 'role')::public.media_role, (v_entry ->> 'sortOrder')::integer,
      'github_legacy', v_entry ->> 'sha256', v_entry ->> 'sha256',
      v_entry ->> 'legacyPath', v_entry, p_actor_id
    )
    on conflict (publication_snapshot_id, role, position) do nothing;

    select * into v_mapping from public.publication_media_mappings
    where publication_snapshot_id = v_snapshot.id
      and role = (v_entry ->> 'role')::public.media_role
      and position = (v_entry ->> 'sortOrder')::integer;
    if v_mapping.source_media_id <> v_media_id
      or v_mapping.public_media_id is not null
      or v_mapping.public_path is distinct from v_entry ->> 'legacyPath'
      or v_mapping.frozen_metadata is distinct from v_entry
    then
      raise exception using errcode = '23514', message = 'legacy mapping conflict';
    end if;
  end loop;

  select jsonb_array_length(v_snapshot.media_manifest) into v_expected;
  select count(*)::integer into v_actual from public.publication_media_mappings
  where publication_snapshot_id = v_snapshot.id;
  if v_actual <> v_expected then
    raise exception using errcode = '23514', message = 'publication media incomplete';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceMediaId', source_media_id,
    'publicMediaId', public_media_id,
    'role', role,
    'sortOrder', position,
    'publicSource', case when source_type = 'github_legacy' then 'github_legacy' else 'cms_public' end,
    'publicPath', public_path,
    'sha256', public_checksum_sha256,
    'metadata', frozen_metadata
  ) order by case role when 'cover' then 0 else 1 end, position), '[]'::jsonb)
  into v_public_manifest
  from public.publication_media_mappings where publication_snapshot_id = v_snapshot.id;

  update public.publication_media_preparations set
    status = 'ready',
    promoted_count = (
      select count(distinct public_media_id)::integer from public.publication_media_mappings
      where publication_snapshot_id = v_snapshot.id and source_type = 'cms_draft'
    ),
    legacy_count = (
      select count(*)::integer from public.publication_media_mappings
      where publication_snapshot_id = v_snapshot.id and source_type = 'github_legacy'
    ),
    failed_count = 0,
    public_manifest = v_public_manifest,
    manifest_checksum_sha256 = encode(digest(public.canonical_jsonb_text(v_public_manifest), 'sha256'), 'hex'),
    error_code = null
  where publication_snapshot_id = v_snapshot.id
  returning * into v_result;
  if not found then raise exception using errcode = '23514', message = 'media preparation not started'; end if;
  return v_result;
end;
$$;

create function public.fail_publication_media_preparation(
  p_actor_id uuid,
  p_snapshot_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active = true) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  update public.publication_media_preparations set
    status = 'failed', failed_count = greatest(failed_count, 1),
    error_code = left(coalesce(nullif(p_error_code, ''), 'PROMOTION_FAILED'), 80)
  where publication_snapshot_id = p_snapshot_id and status <> 'ready';
end;
$$;

revoke all on function public.begin_publication_media_preparation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.register_publication_media_asset(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_publication_media_preparation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_publication_media_preparation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_publication_media_preparation(uuid, uuid) to service_role;
grant execute on function public.register_publication_media_asset(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.finalize_publication_media_preparation(uuid, uuid) to service_role;
grant execute on function public.fail_publication_media_preparation(uuid, uuid, text) to service_role;

comment on table public.publication_media_preparations is
  'Snapshot-scoped Stage 7B status and deterministic public media projection. It never changes the snapshot or published pointer.';
comment on table public.publication_media_mappings is
  'Immutable logical role/order mapping from a frozen snapshot media entry to either an existing Legacy path or a cms_public media row.';
comment on column public.publication_media_mappings.frozen_metadata is
  'Exact Stage 7A.1 manifest entry; publication metadata must not be sourced from current media_assets.';

commit;
