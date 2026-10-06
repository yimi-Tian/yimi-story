import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationPath = resolve(import.meta.dirname, "../../supabase/migrations/202610050001_activity_walking_identities.sql");
const migration = await readFile(migrationPath, "utf8");

test("Walking identity migration is additive and defines stable server-owned identity", () => {
  assert.match(migration, /create table public\.activity_walking_identities/i);
  assert.match(migration, /content_id uuid primary key references public\.content_items\(id\) on delete cascade/i);
  assert.match(migration, /walking_record_id text not null unique/i);
  assert.match(migration, /allocated_year integer not null/i);
  assert.match(migration, /created_by uuid not null references auth\.users\(id\)/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)/i);
  assert.doesNotMatch(migration, /alter table public\.(content_items|content_drafts|publication_snapshots)[\s\S]*?(add|drop|alter) column/i);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});

test("DB constraints enforce WR format, year range, one identity per Activity and global uniqueness", () => {
  assert.match(migration, /walking_record_id ~ '\^WR-\[0-9\]\{3\}-\[0-9\]\{3\}\$'/i);
  assert.match(migration, /allocated_year between 100 and 999/i);
  assert.match(migration, /substring\(walking_record_id from 4 for 3\) = lpad\(allocated_year::text, 3, '0'\)/i);
  assert.match(migration, /content_id uuid primary key/i);
  assert.match(migration, /walking_record_id text not null unique/i);
});

test("trusted RPC validates active admin, existence and Activity content type", () => {
  assert.match(migration, /create function public\.get_or_create_activity_walking_identity\(p_content_id uuid\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog, public/i);
  assert.match(migration, /if not public\.is_active_admin\(\)/i);
  assert.match(migration, /content item not found/i);
  assert.match(migration, /v_content_type <> 'activity'::public\.content_type/i);
  assert.match(migration, /created_by[\s\S]*auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /p_walking_record_id|p_allocated_year|p_created_by/i);
});

test("allocator reuses identity and serializes year-scoped max+1 allocation", () => {
  assert.ok((migration.match(/where identity\.content_id = p_content_id/gi) ?? []).length >= 2);
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]*yimi-walking-id:/i);
  assert.match(migration, /max\(\(regexp_match\(identity\.walking_record_id, v_pattern\)\)\[1\]::integer\)/i);
  assert.match(migration, /coalesce\([\s\S]*, 0\) \+ 1/i);
  assert.match(migration, /lpad\(v_sequence::text, 3, '0'\)/i);
  assert.match(migration, /if v_sequence > 999/i);
});

test("existing identity is returned before reading the current canonical year", () => {
  const existingLookup = migration.indexOf("select identity.walking_record_id");
  const yearLookup = migration.indexOf("select coalesce(");
  assert.ok(existingLookup >= 0 && yearLookup > existingLookup);
  assert.match(migration, /coalesce\([\s\S]*draft\.data ->> 'year'[\s\S]*snapshot\.snapshot_data ->> 'year'/i);
});

test("RLS permits active-admin reads while browser roles cannot write identities", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /for select to authenticated[\s\S]*using \(public\.is_active_admin\(\)\)/i);
  assert.match(migration, /revoke all on table public\.activity_walking_identities from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.activity_walking_identities to authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*activity_walking_identities[^;]*authenticated/i);
  assert.doesNotMatch(migration, /create policy activity_walking_identities_(insert|update|delete)/i);
});

test("Walking identity stays outside browser-owned canonical draft and publication code", async () => {
  const activityType = await readFile(resolve(import.meta.dirname, "../../admin/src/content/content-contracts.ts"), "utf8");
  assert.doesNotMatch(activityType, /walkingRecordId/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(publication_snapshots|github_publications|media_assets)/i);
  assert.doesNotMatch(migration, /walking-records\.json/i);
});
