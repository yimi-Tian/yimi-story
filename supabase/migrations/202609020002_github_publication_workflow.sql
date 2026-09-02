begin;

alter type public.github_publication_state add value if not exists 'dry_run_ready';
alter type public.github_publication_state add value if not exists 'branch_created';
alter type public.github_publication_state add value if not exists 'deploy_pending';
alter type public.github_publication_state add value if not exists 'deployed';
alter type public.github_publication_state add value if not exists 'finalized';
alter type public.github_publication_state add value if not exists 'cancelled';

commit;

begin;

alter table public.github_publications
  add column content_id uuid references public.content_items(id) on delete restrict,
  add column media_preparation_id uuid references public.publication_media_preparations(publication_snapshot_id) on delete restrict,
  add column formal_manifest jsonb,
  add column created_by uuid references auth.users(id),
  add column expected_published_snapshot_id uuid references public.publication_snapshots(id) on delete restrict,
  add column merge_commit_sha text,
  add column merged_at timestamptz,
  add column deployed_at timestamptz,
  add column finalized_at timestamptz,
  add column finalized_by uuid references auth.users(id),
  add column updated_at timestamptz not null default now();

alter table public.github_publications
  add constraint github_publications_base_branch_main_check check (base_branch = 'main'),
  add constraint github_publications_stage7c_head_branch_check check (head_branch ~ '^publication/(class-result|activity)/[A-Za-z0-9._-]+/[0-9a-f]{12}$'),
  add constraint github_publications_sha_check check (
    base_sha ~ '^[0-9a-f]{40}$'
    and (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$')
    and (merge_commit_sha is null or merge_commit_sha ~ '^[0-9a-f]{40}$')
  ),
  add constraint github_publications_manifest_check check (
    formal_manifest is null or jsonb_typeof(formal_manifest) = 'object'
  );

create unique index github_publications_one_active_content_idx
  on public.github_publications (content_id)
  where pr_state in ('creating', 'dry_run_ready', 'branch_created', 'open', 'merged', 'deploy_pending', 'deployed');

create trigger github_publications_set_updated_at
before update on public.github_publications
for each row execute function public.set_updated_at();

revoke insert, update, delete on table public.github_publications from anon, authenticated;
grant select on table public.github_publications to authenticated, service_role;
grant all on table public.github_publications to service_role;
grant usage on type public.github_publication_state to authenticated, service_role;

create function public.begin_github_publication(
  p_actor_id uuid,
  p_snapshot_id uuid,
  p_base_sha text,
  p_head_branch text,
  p_formal_manifest jsonb
)
returns public.github_publications
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot public.publication_snapshots;
  v_item public.content_items;
  v_preparation public.publication_media_preparations;
  v_result public.github_publications;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;
  select * into v_snapshot from public.publication_snapshots where id = p_snapshot_id;
  if not found or v_snapshot.schema_version <> '1.1' or v_snapshot.snapshot_source <> 'draft'
    or v_snapshot.status <> 'ready' or v_snapshot.publication_validation ->> 'valid' <> 'true' then
    raise exception using errcode = '23514', message = 'snapshot not eligible';
  end if;
  select * into v_item from public.content_items where id = v_snapshot.content_id;
  select * into v_preparation from public.publication_media_preparations
    where publication_snapshot_id = v_snapshot.id and status = 'ready';
  if not found then raise exception using errcode = '23514', message = 'public media not ready'; end if;
  if p_base_sha !~ '^[0-9a-f]{40}$'
    or p_head_branch !~ '^publication/(class-result|activity)/[A-Za-z0-9._-]+/[0-9a-f]{12}$'
    or jsonb_typeof(p_formal_manifest) <> 'object'
    or p_formal_manifest ->> 'repositoryOwner' <> 'yimi-Tian'
    or p_formal_manifest ->> 'repositoryName' <> 'yimi-story'
    or p_formal_manifest ->> 'baseBranch' <> 'main'
    or p_formal_manifest ->> 'snapshotId' <> p_snapshot_id::text
    or p_formal_manifest ->> 'snapshotChecksum' <> v_snapshot.checksum_sha256
    or p_formal_manifest ->> 'mediaPreparationId' <> v_preparation.publication_snapshot_id::text
    or p_formal_manifest ->> 'mediaManifestChecksum' <> v_preparation.manifest_checksum_sha256
    or jsonb_array_length(coalesce(p_formal_manifest -> 'files', '[]'::jsonb)) <> 6
  then
    raise exception using errcode = '23514', message = 'formal manifest invalid';
  end if;

  select * into v_result from public.github_publications where snapshot_id = p_snapshot_id;
  if found then
    if v_result.base_sha is distinct from p_base_sha
      or v_result.head_branch is distinct from p_head_branch
      or v_result.formal_manifest is distinct from p_formal_manifest then
      raise exception using errcode = '23514', message = 'publication identity conflict';
    end if;
    return v_result;
  end if;
  if exists (
    select 1 from public.github_publications
    where content_id = v_item.id
      and pr_state in ('creating', 'dry_run_ready', 'branch_created', 'open', 'merged', 'deploy_pending', 'deployed')
  ) then
    raise exception using errcode = '23505', message = 'active publication already exists';
  end if;

  insert into public.github_publications (
    snapshot_id, content_id, media_preparation_id, base_branch, head_branch, base_sha,
    formal_manifest, pr_state, created_by, expected_published_snapshot_id
  ) values (
    v_snapshot.id, v_item.id, v_preparation.publication_snapshot_id, 'main', p_head_branch, p_base_sha,
    p_formal_manifest, 'dry_run_ready', p_actor_id, v_item.published_snapshot_id
  ) returning * into v_result;
  return v_result;
end;
$$;

create function public.record_github_publication_pr(
  p_actor_id uuid,
  p_publication_id uuid,
  p_commit_sha text,
  p_pr_number integer,
  p_pr_url text
)
returns public.github_publications
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result public.github_publications;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active) then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if p_commit_sha !~ '^[0-9a-f]{40}$' or p_pr_number <= 0 or p_pr_url !~ '^https://github.com/yimi-Tian/yimi-story/pull/[0-9]+$' then
    raise exception using errcode = '23514', message = 'pull request identity invalid';
  end if;
  update public.github_publications set commit_sha = p_commit_sha, pr_number = p_pr_number,
    pr_url = p_pr_url, pr_state = 'open', error_code = null, error_message = null, checked_at = now()
  where id = p_publication_id and pr_state in ('dry_run_ready', 'branch_created', 'open')
  returning * into v_result;
  if not found then raise exception using errcode = '23514', message = 'publication state invalid'; end if;
  return v_result;
end;
$$;

create function public.set_github_publication_state(
  p_actor_id uuid,
  p_publication_id uuid,
  p_state public.github_publication_state,
  p_merge_commit_sha text default null,
  p_error_code text default null
)
returns public.github_publications
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result public.github_publications;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active) then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  if p_state not in ('branch_created', 'merged', 'deploy_pending', 'deployed', 'failed', 'cancelled') then
    raise exception using errcode = '23514', message = 'unsupported state transition';
  end if;
  update public.github_publications set pr_state = p_state,
    merge_commit_sha = coalesce(p_merge_commit_sha, merge_commit_sha),
    merged_at = case when p_state in ('merged','deploy_pending','deployed') then coalesce(merged_at, now()) else merged_at end,
    deployed_at = case when p_state = 'deployed' then coalesce(deployed_at, now()) else deployed_at end,
    error_code = p_error_code, checked_at = now()
  where id = p_publication_id returning * into v_result;
  if not found then raise exception using errcode = 'P0002', message = 'publication not found'; end if;
  return v_result;
end;
$$;

create function public.finalize_github_publication(
  p_actor_id uuid,
  p_publication_id uuid,
  p_merge_commit_sha text
)
returns public.github_publications
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_publication public.github_publications; v_item public.content_items;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or not exists (select 1 from public.admin_users where user_id = p_actor_id and is_active) then
    raise exception using errcode = '42501', message = 'service operation required';
  end if;
  select * into v_publication from public.github_publications where id = p_publication_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'publication not found'; end if;
  if v_publication.pr_state = 'finalized' then return v_publication; end if;
  if v_publication.pr_state <> 'deployed' or p_merge_commit_sha !~ '^[0-9a-f]{40}$'
    or v_publication.merge_commit_sha is distinct from p_merge_commit_sha then
    raise exception using errcode = '23514', message = 'publication not finalizable';
  end if;
  select * into v_item from public.content_items where id = v_publication.content_id for update;
  if v_item.published_snapshot_id is distinct from v_publication.expected_published_snapshot_id then
    raise exception using errcode = '40001', message = 'published pointer changed';
  end if;
  update public.content_items set published_snapshot_id = v_publication.snapshot_id where id = v_item.id;
  update public.github_publications set pr_state = 'finalized', finalized_at = now(), finalized_by = p_actor_id,
    checked_at = now() where id = v_publication.id returning * into v_publication;
  return v_publication;
end;
$$;

revoke all on function public.begin_github_publication(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.record_github_publication_pr(uuid,uuid,text,integer,text) from public, anon, authenticated;
revoke all on function public.set_github_publication_state(uuid,uuid,public.github_publication_state,text,text) from public, anon, authenticated;
revoke all on function public.finalize_github_publication(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.begin_github_publication(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.record_github_publication_pr(uuid,uuid,text,integer,text) to service_role;
grant execute on function public.set_github_publication_state(uuid,uuid,public.github_publication_state,text,text) to service_role;
grant execute on function public.finalize_github_publication(uuid,uuid,text) to service_role;

commit;
