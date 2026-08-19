begin;

create function public.get_or_create_content_draft(p_content_id uuid)
returns public.content_drafts
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_draft public.content_drafts;
begin
  if not public.is_active_admin() then
    raise exception 'active admin required';
  end if;

  select * into v_draft
  from public.content_drafts
  where content_id = p_content_id;

  if found then
    return v_draft;
  end if;

  insert into public.content_drafts (
    content_id, revision, status, data, validation_result, created_by, updated_by
  )
  select
    item.id,
    1,
    'draft'::public.draft_status,
    snapshot.snapshot_data,
    '{"valid":false,"errors":[],"warnings":[]}'::jsonb,
    auth.uid(),
    auth.uid()
  from public.content_items item
  join public.publication_snapshots snapshot
    on snapshot.id = item.published_snapshot_id
  where item.id = p_content_id
  on conflict (content_id) do nothing
  returning * into v_draft;

  if v_draft.id is null then
    select * into v_draft
    from public.content_drafts
    where content_id = p_content_id;
  end if;

  if v_draft.id is null then
    raise exception 'published content not found';
  end if;

  return v_draft;
end;
$$;

create function public.create_content_with_draft(
  p_content_type public.content_type,
  p_year integer,
  p_data jsonb,
  p_validation_result jsonb
)
returns table (
  content_id uuid,
  public_id text,
  draft_id uuid,
  revision integer,
  status public.draft_status
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_sequence integer;
  v_public_id text;
  v_content_id uuid;
  v_draft public.content_drafts;
  v_pattern text;
begin
  if not public.is_active_admin() then
    raise exception 'active admin required';
  end if;
  if p_year < 100 or p_year > 199 then
    raise exception 'invalid content year';
  end if;
  if jsonb_typeof(p_data) <> 'object'
    or jsonb_typeof(p_validation_result) <> 'object'
  then
    raise exception 'invalid draft payload';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('yimi-public-id:' || p_content_type::text || ':' || p_year::text, 0)
  );

  v_pattern := case
    when p_content_type = 'class_result' then '^CR-' || p_year::text || '-([0-9]{3})$'
    else '^' || p_year::text || '-([0-9]{3})$'
  end;

  select coalesce(max((regexp_match(item.public_id, v_pattern))[1]::integer), 0) + 1
  into v_sequence
  from public.content_items item
  where item.content_type = p_content_type
    and item.public_id ~ v_pattern;

  if v_sequence > 999 then
    raise exception 'public id sequence exhausted';
  end if;

  v_public_id := case
    when p_content_type = 'class_result'
      then 'CR-' || p_year::text || '-' || lpad(v_sequence::text, 3, '0')
    else p_year::text || '-' || lpad(v_sequence::text, 3, '0')
  end;

  insert into public.content_items (content_type, public_id, created_by)
  values (p_content_type, v_public_id, auth.uid())
  returning id into v_content_id;

  insert into public.content_drafts (
    content_id, revision, status, data, validation_result, created_by, updated_by
  ) values (
    v_content_id,
    1,
    'draft',
    jsonb_set(jsonb_set(p_data, '{id}', to_jsonb(v_public_id), true), '{year}', to_jsonb(p_year), true),
    p_validation_result,
    auth.uid(),
    auth.uid()
  )
  returning * into v_draft;

  return query select v_content_id, v_public_id, v_draft.id, v_draft.revision, v_draft.status;
end;
$$;

revoke all on function public.get_or_create_content_draft(uuid) from public, anon;
revoke all on function public.create_content_with_draft(public.content_type, integer, jsonb, jsonb) from public, anon;
grant execute on function public.get_or_create_content_draft(uuid) to authenticated, service_role;
grant execute on function public.create_content_with_draft(public.content_type, integer, jsonb, jsonb) to authenticated, service_role;

comment on function public.get_or_create_content_draft(uuid) is
  'Atomically reuses the unique draft or copies immutable published snapshot data for first edit.';
comment on function public.create_content_with_draft(public.content_type, integer, jsonb, jsonb) is
  'Allocates a year-scoped public ID under an advisory transaction lock and creates item plus draft atomically.';

commit;
