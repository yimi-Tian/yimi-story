begin;

create table public.activity_walking_identities (
  content_id uuid primary key references public.content_items(id) on delete cascade,
  walking_record_id text not null unique,
  allocated_year integer not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint activity_walking_identities_id_format_check
    check (walking_record_id ~ '^WR-[0-9]{3}-[0-9]{3}$'),
  constraint activity_walking_identities_year_check
    check (allocated_year between 100 and 999),
  constraint activity_walking_identities_year_match_check
    check (substring(walking_record_id from 4 for 3) = lpad(allocated_year::text, 3, '0'))
);

alter table public.activity_walking_identities enable row level security;

create policy activity_walking_identities_select_active_admin
on public.activity_walking_identities
for select to authenticated
using (public.is_active_admin());

revoke all on table public.activity_walking_identities from public, anon, authenticated;
grant select on table public.activity_walking_identities to authenticated;
grant all on table public.activity_walking_identities to service_role;

create function public.get_or_create_activity_walking_identity(p_content_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_content_type public.content_type;
  v_existing_id text;
  v_year_text text;
  v_allocated_year integer;
  v_sequence integer;
  v_pattern text;
  v_walking_record_id text;
begin
  if not public.is_active_admin() then
    raise exception 'active admin required';
  end if;

  select item.content_type
  into v_content_type
  from public.content_items item
  where item.id = p_content_id;

  if not found then
    raise exception 'content item not found';
  end if;
  if v_content_type <> 'activity'::public.content_type then
    raise exception 'walking identity requires activity content';
  end if;

  select identity.walking_record_id
  into v_existing_id
  from public.activity_walking_identities identity
  where identity.content_id = p_content_id;

  if found then
    return v_existing_id;
  end if;

  select coalesce(
    nullif(btrim(draft.data ->> 'year'), ''),
    nullif(btrim(snapshot.snapshot_data ->> 'year'), '')
  )
  into v_year_text
  from public.content_items item
  left join public.content_drafts draft on draft.content_id = item.id
  left join public.publication_snapshots snapshot on snapshot.id = item.published_snapshot_id
  where item.id = p_content_id;

  if v_year_text is null or v_year_text !~ '^[0-9]{3}$' then
    raise exception 'activity canonical year is invalid';
  end if;

  v_allocated_year := v_year_text::integer;
  if v_allocated_year < 100 or v_allocated_year > 999 then
    raise exception 'activity canonical year is invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('yimi-walking-id:' || v_allocated_year::text, 0)
  );

  -- A concurrent request for the same Activity may have waited on this lock.
  select identity.walking_record_id
  into v_existing_id
  from public.activity_walking_identities identity
  where identity.content_id = p_content_id;

  if found then
    return v_existing_id;
  end if;

  v_pattern := '^WR-' || v_allocated_year::text || '-([0-9]{3})$';

  select coalesce(max((regexp_match(identity.walking_record_id, v_pattern))[1]::integer), 0) + 1
  into v_sequence
  from public.activity_walking_identities identity
  where identity.allocated_year = v_allocated_year
    and identity.walking_record_id ~ v_pattern;

  if v_sequence > 999 then
    raise exception 'walking identity sequence exhausted';
  end if;

  v_walking_record_id := 'WR-' || v_allocated_year::text || '-' || lpad(v_sequence::text, 3, '0');

  insert into public.activity_walking_identities (
    content_id,
    walking_record_id,
    allocated_year,
    created_by
  ) values (
    p_content_id,
    v_walking_record_id,
    v_allocated_year,
    auth.uid()
  );

  return v_walking_record_id;
end;
$$;

revoke all on function public.get_or_create_activity_walking_identity(uuid) from public, anon;
grant execute on function public.get_or_create_activity_walking_identity(uuid) to authenticated, service_role;

comment on table public.activity_walking_identities is
  'Server-owned, stable Walking Record identity for an Activity. Browser clients have read-only access.';
comment on column public.activity_walking_identities.allocated_year is
  'Activity canonical year at first allocation; later Activity year changes never renumber the identity.';
comment on function public.get_or_create_activity_walking_identity(uuid) is
  'Returns the stable Activity Walking ID or allocates the next year-scoped ID under an advisory transaction lock.';

commit;
