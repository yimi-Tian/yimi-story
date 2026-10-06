-- CI-only minimal prerequisite schema for the WB2 migration.
-- Production uses the complete Supabase migration chain; this fixture only
-- supplies objects referenced by 202610050001_activity_walking_identities.sql.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create type public.content_type as enum ('class_result', 'activity');

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_active boolean not null default true
);

create table public.publication_snapshots (
  id uuid primary key,
  snapshot_data jsonb not null
);

create table public.content_items (
  id uuid primary key,
  content_type public.content_type not null,
  public_id text not null,
  created_by uuid not null references auth.users(id),
  published_snapshot_id uuid references public.publication_snapshots(id),
  unique (content_type, public_id)
);

create table public.content_drafts (
  id uuid primary key,
  content_id uuid not null unique references public.content_items(id) on delete cascade,
  revision integer not null default 1,
  status text not null default 'draft',
  data jsonb not null default '{}'::jsonb,
  validation_result jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id)
);

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
grant usage on schema public to anon, authenticated, service_role;
grant usage on type public.content_type to authenticated, service_role;
