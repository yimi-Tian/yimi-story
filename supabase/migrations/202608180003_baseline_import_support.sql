begin;

create type public.snapshot_source as enum ('draft', 'baseline_import');

alter type public.publication_status
  add value if not exists 'baseline_published';

alter table public.publication_snapshots
  add column snapshot_source public.snapshot_source not null default 'draft';

alter table public.publication_snapshots
  alter column source_draft_id drop not null;

alter table public.publication_snapshots
  drop constraint publication_snapshots_source_revision_check;

alter table public.publication_snapshots
  add constraint publication_snapshots_source_check check (
    (
      snapshot_source = 'draft'
      and source_draft_id is not null
      and source_revision >= 1
    )
    or
    (
      snapshot_source = 'baseline_import'
      and source_draft_id is null
      and source_revision = 0
    )
  );

create unique index publication_snapshots_one_baseline_per_content_idx
  on public.publication_snapshots (content_id)
  where snapshot_source = 'baseline_import';

alter table public.media_assets
  add column legacy_asset_key text;

alter table public.media_assets
  alter column contains_portrait drop not null,
  alter column contains_portrait drop default;

alter table public.media_assets
  drop constraint media_assets_portrait_consent_check;

alter table public.media_assets
  add constraint media_assets_portrait_consent_check check (
    (
      rights_status = 'legacy_retained'
      and source = 'github_legacy'
      and contains_portrait is null
      and portrait_consent = 'not_applicable'
    )
    or
    (
      rights_status <> 'legacy_retained'
      and contains_portrait is not null
      and (not contains_portrait or portrait_consent in ('confirmed', 'pending'))
    )
  ),
  add constraint media_assets_legacy_key_check check (
    source <> 'github_legacy'
    or (legacy_asset_key is not null and length(btrim(legacy_asset_key)) > 0)
  ),
  add constraint media_assets_legacy_rights_check check (
    rights_status <> 'legacy_retained' or source = 'github_legacy'
  );

create unique index media_assets_legacy_asset_key_idx
  on public.media_assets (content_id, legacy_asset_key)
  where source = 'github_legacy';

grant usage on type public.snapshot_source to authenticated, service_role;

comment on column public.publication_snapshots.snapshot_source is
  'draft requires a source draft and revision >= 1; baseline_import requires no draft and revision 0.';
comment on column public.media_assets.legacy_asset_key is
  'Stable canonical media ID used only for idempotent GitHub legacy baseline imports.';
comment on column public.media_assets.contains_portrait is
  'NULL means legacy baseline metadata was not reviewed; it must not be used for new uploads.';

commit;
