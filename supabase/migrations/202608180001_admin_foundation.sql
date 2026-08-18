begin;

create extension if not exists pgcrypto with schema extensions;

create type public.content_type as enum ('class_result', 'activity');
create type public.draft_status as enum ('draft', 'validated');
create type public.publication_status as enum (
  'ready', 'creating_pr', 'pr_open', 'pr_merged', 'pr_closed', 'failed'
);
create type public.media_source as enum ('github_legacy', 'supabase_upload');
create type public.media_role as enum ('cover', 'gallery');
create type public.media_rights_status as enum ('pending', 'confirmed', 'legacy_retained');
create type public.portrait_consent_status as enum ('not_applicable', 'confirmed', 'pending');
create type public.media_upload_status as enum ('uploaded', 'ready', 'failed');
create type public.github_publication_state as enum ('creating', 'open', 'merged', 'closed', 'failed');

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (length(btrim(email)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_users_email_idx on public.admin_users (lower(email));

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  content_type public.content_type not null,
  public_id text not null check (length(btrim(public_id)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_items_content_type_public_id_key unique (content_type, public_id)
);

create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  revision integer not null default 1 check (revision >= 1),
  status public.draft_status not null default 'draft',
  data jsonb not null default '{}'::jsonb,
  validation_result jsonb not null default '{"valid":false,"errors":[],"warnings":[]}'::jsonb,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_drafts_one_active_per_content_key unique (content_id),
  constraint content_drafts_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint content_drafts_validation_is_object check (jsonb_typeof(validation_result) = 'object')
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  draft_id uuid references public.content_drafts(id) on delete set null,
  source public.media_source not null,
  role public.media_role not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  legacy_path text,
  bucket text,
  object_path text,
  public_url text,
  original_filename text not null check (length(btrim(original_filename)) > 0),
  mime_type text not null check (length(btrim(mime_type)) > 0),
  extension text not null check (length(btrim(extension)) > 0),
  byte_size bigint not null check (byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  alt_text text not null default '',
  caption text,
  credit text,
  rights_status public.media_rights_status not null,
  contains_portrait boolean not null default false,
  portrait_consent public.portrait_consent_status not null default 'not_applicable',
  upload_status public.media_upload_status not null default 'uploaded',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint media_assets_legacy_source_check check (
    source <> 'github_legacy'
    or (legacy_path is not null and length(btrim(legacy_path)) > 0)
  ),
  constraint media_assets_upload_source_check check (
    source <> 'supabase_upload'
    or (
      bucket is not null
      and length(btrim(bucket)) > 0
      and object_path is not null
      and length(btrim(object_path)) > 0
    )
  ),
  constraint media_assets_portrait_consent_check check (
    not contains_portrait or portrait_consent in ('confirmed', 'pending')
  )
);
create index media_assets_content_id_idx on public.media_assets (content_id);
create index media_assets_draft_id_idx on public.media_assets (draft_id);
create index media_assets_active_idx on public.media_assets (content_id, role, sort_order)
  where deleted_at is null;

create table public.publication_snapshots (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id),
  source_draft_id uuid not null references public.content_drafts(id),
  source_revision integer not null check (source_revision >= 1),
  schema_version text not null check (length(btrim(schema_version)) > 0),
  snapshot_data jsonb not null,
  media_manifest jsonb not null default '[]'::jsonb,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status public.publication_status not null default 'ready',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint publication_snapshots_data_is_object check (jsonb_typeof(snapshot_data) = 'object'),
  constraint publication_snapshots_media_is_array check (jsonb_typeof(media_manifest) = 'array')
);
create index publication_snapshots_content_id_idx
  on public.publication_snapshots (content_id, created_at desc);

create table public.github_publications (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references public.publication_snapshots(id),
  base_branch text not null default 'main' check (length(btrim(base_branch)) > 0),
  head_branch text not null check (length(btrim(head_branch)) > 0),
  base_sha text not null check (length(btrim(base_sha)) > 0),
  commit_sha text,
  pr_number integer check (pr_number is null or pr_number > 0),
  pr_url text,
  pr_state public.github_publication_state not null default 'creating',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

-- Add circular publication references only after both base tables exist.
alter table public.content_items
  add column published_snapshot_id uuid,
  add constraint content_items_published_snapshot_id_fkey
    foreign key (published_snapshot_id)
    references public.publication_snapshots(id)
    on delete set null;

alter table public.media_assets
  add column published_snapshot_id uuid,
  add constraint media_assets_published_snapshot_id_fkey
    foreign key (published_snapshot_id)
    references public.publication_snapshots(id)
    on delete set null;

create index content_items_published_snapshot_id_idx on public.content_items (published_snapshot_id);
create index media_assets_published_snapshot_id_idx on public.media_assets (published_snapshot_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.increment_draft_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.revision = old.revision + 1;
  return new;
end;
$$;

create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();
create trigger content_items_set_updated_at
before update on public.content_items
for each row execute function public.set_updated_at();
create trigger content_drafts_set_updated_at
before update on public.content_drafts
for each row execute function public.set_updated_at();
create trigger content_drafts_increment_revision
before update on public.content_drafts
for each row execute function public.increment_draft_revision();

create function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and is_active = true
  );
$$;
revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to authenticated, service_role;

alter table public.admin_users enable row level security;
alter table public.content_items enable row level security;
alter table public.content_drafts enable row level security;
alter table public.media_assets enable row level security;
alter table public.publication_snapshots enable row level security;
alter table public.github_publications enable row level security;

create policy admin_users_select_self on public.admin_users
for select to authenticated
using (user_id = (select auth.uid()) and public.is_active_admin());

create policy content_items_select_active_admin on public.content_items
for select to authenticated using (public.is_active_admin());
create policy content_items_insert_active_admin on public.content_items
for insert to authenticated
with check (public.is_active_admin() and created_by = (select auth.uid()));
create policy content_items_update_active_admin on public.content_items
for update to authenticated
using (public.is_active_admin())
with check (public.is_active_admin() and created_by = (select auth.uid()));

create policy content_drafts_select_active_admin on public.content_drafts
for select to authenticated using (public.is_active_admin());
create policy content_drafts_insert_active_admin on public.content_drafts
for insert to authenticated
with check (
  public.is_active_admin()
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);
create policy content_drafts_update_active_admin on public.content_drafts
for update to authenticated
using (public.is_active_admin())
with check (public.is_active_admin() and updated_by = (select auth.uid()));

create policy media_assets_select_active_admin on public.media_assets
for select to authenticated using (public.is_active_admin());
create policy media_assets_insert_active_admin on public.media_assets
for insert to authenticated with check (public.is_active_admin());
create policy media_assets_update_active_admin on public.media_assets
for update to authenticated
using (public.is_active_admin()) with check (public.is_active_admin());

create policy publication_snapshots_select_active_admin on public.publication_snapshots
for select to authenticated using (public.is_active_admin());
create policy github_publications_select_active_admin on public.github_publications
for select to authenticated using (public.is_active_admin());

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.content_items from anon, authenticated;
revoke all on table public.content_drafts from anon, authenticated;
revoke all on table public.media_assets from anon, authenticated;
revoke all on table public.publication_snapshots from anon, authenticated;
revoke all on table public.github_publications from anon, authenticated;

grant select on table public.admin_users to authenticated;
grant select, insert, update on table public.content_items to authenticated;
grant select, insert, update on table public.content_drafts to authenticated;
grant select, insert, update on table public.media_assets to authenticated;
grant select on table public.publication_snapshots to authenticated;
grant select on table public.github_publications to authenticated;

grant all on table public.admin_users to service_role;
grant all on table public.content_items to service_role;
grant all on table public.content_drafts to service_role;
grant all on table public.media_assets to service_role;
grant all on table public.publication_snapshots to service_role;
grant all on table public.github_publications to service_role;

grant usage on type public.content_type to authenticated, service_role;
grant usage on type public.draft_status to authenticated, service_role;
grant usage on type public.publication_status to authenticated, service_role;
grant usage on type public.media_source to authenticated, service_role;
grant usage on type public.media_role to authenticated, service_role;
grant usage on type public.media_rights_status to authenticated, service_role;
grant usage on type public.portrait_consent_status to authenticated, service_role;
grant usage on type public.media_upload_status to authenticated, service_role;
grant usage on type public.github_publication_state to authenticated, service_role;

comment on table public.admin_users is
  'V1 allow-list managed only by migrations, local seed tooling, or service-role code.';
comment on column public.content_items.public_id is
  'Application code must treat public_id as immutable after the first publication.';
comment on column public.content_drafts.revision is
  'Incremented automatically on every update by content_drafts_increment_revision.';
comment on table public.publication_snapshots is
  'Immutable from browser clients; writes are reserved for service-role Edge Functions.';
comment on table public.github_publications is
  'Browser clients have SELECT-only access; GitHub writes are implemented later.';

commit;
