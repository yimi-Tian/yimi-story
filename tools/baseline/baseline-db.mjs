import { spawnSync } from "node:child_process";

export const BASELINE_IMPORT_USER_ID = "00000000-0000-4000-8000-000000000119";
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONTAINER = "supabase_db_yimi-story-local";

export function assertLocalDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("資料庫 URL 格式無效"); }
  if (!["postgresql:", "postgres:"].includes(url.protocol)) throw new Error("只允許 PostgreSQL URL");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("基準匯入只允許本機資料庫 host");
  if (url.port !== "54322") throw new Error("基準匯入只允許 Supabase local DB port 54322");
  if (url.hostname.endsWith("supabase.co")) throw new Error("禁止對 managed Supabase 執行基準匯入");
  return url;
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `docker exit ${result.status}`).trim());
  return result.stdout;
}

function verifyLocalContainerPort() {
  const output = runDocker(["port", DB_CONTAINER, "5432/tcp"]);
  if (!/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):54322\b/.test(output)) {
    throw new Error(`本機 Supabase DB container 未映射至 54322：${output.trim()}`);
  }
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function recordSql(record) {
  const mediaValues = record.media.map((asset) => `(
    v_content_id, null, 'github_legacy', ${sqlText(asset.role)}, ${asset.sortOrder}, ${sqlText(asset.legacyPath)},
    null, null, null, ${sqlText(asset.originalFilename)}, ${sqlText(asset.mimeType)}, ${sqlText(asset.extension)},
    ${asset.byteSize}, ${asset.width}, ${asset.height}, ${sqlText(asset.sha256)}, ${sqlText(asset.altText)}, null, null,
    'legacy_retained', null, 'not_applicable', 'ready', v_snapshot_id, ${sqlText(asset.stableAssetKey)}
  )`).join(",\n");
  return `
do $baseline_record$
declare
  v_content_id uuid;
  v_snapshot_id uuid;
  v_checksum text;
  v_media_count integer;
  v_matching_media_count integer;
begin
  select id into v_content_id from public.content_items
  where content_type = ${sqlText(record.contentType)}::public.content_type and public_id = ${sqlText(record.publicId)};

  if v_content_id is null then
    insert into public.content_items (content_type, public_id, created_by)
    values (${sqlText(record.contentType)}, ${sqlText(record.publicId)}, ${sqlText(BASELINE_IMPORT_USER_ID)}::uuid)
    returning id into v_content_id;

    insert into public.publication_snapshots (
      content_id, source_draft_id, source_revision, schema_version, snapshot_data, media_manifest,
      checksum_sha256, status, created_by, snapshot_source
    ) values (
      v_content_id, null, 0, ${sqlText(record.schemaVersion)}, ${sqlJson(record.snapshotData)}, ${sqlJson(record.mediaManifest)},
      ${sqlText(record.checksumSha256)}, 'baseline_published', ${sqlText(BASELINE_IMPORT_USER_ID)}::uuid, 'baseline_import'
    ) returning id into v_snapshot_id;

    ${mediaValues ? `insert into public.media_assets (
      content_id, draft_id, source, role, sort_order, legacy_path, bucket, object_path, public_url,
      original_filename, mime_type, extension, byte_size, width, height, sha256, alt_text, caption, credit,
      rights_status, contains_portrait, portrait_consent, upload_status, published_snapshot_id, legacy_asset_key
    ) values ${mediaValues};` : ""}

    update public.content_items set published_snapshot_id = v_snapshot_id where id = v_content_id;
    update baseline_import_result set inserted = inserted + 1;
  else
    select id, checksum_sha256 into v_snapshot_id, v_checksum
    from public.publication_snapshots
    where content_id = v_content_id and snapshot_source = 'baseline_import';

    if v_snapshot_id is null then
      raise exception 'BASELINE_CONFLICT: %:% exists without baseline snapshot', ${sqlText(record.contentType)}, ${sqlText(record.publicId)};
    end if;
    if v_checksum <> ${sqlText(record.checksumSha256)} then
      raise exception 'BASELINE_CONFLICT: %:% checksum differs', ${sqlText(record.contentType)}, ${sqlText(record.publicId)};
    end if;
    if (select published_snapshot_id from public.content_items where id = v_content_id) is distinct from v_snapshot_id then
      raise exception 'BASELINE_CONFLICT: %:% published snapshot differs', ${sqlText(record.contentType)}, ${sqlText(record.publicId)};
    end if;

    select count(*) into v_media_count from public.media_assets where content_id = v_content_id and source = 'github_legacy';
    select count(*) into v_matching_media_count
    from public.media_assets m
    join jsonb_to_recordset(${sqlJson(record.media)}) as expected(
      "stableAssetKey" text, role text, "sortOrder" integer, "legacyPath" text, "altText" text,
      "originalFilename" text, "mimeType" text, extension text, "byteSize" bigint, width integer, height integer, sha256 text
    ) on m.legacy_asset_key = expected."stableAssetKey"
    where m.content_id = v_content_id and m.source = 'github_legacy'
      and m.role::text = expected.role and m.sort_order = expected."sortOrder"
      and m.legacy_path = expected."legacyPath" and m.alt_text = expected."altText"
      and m.original_filename = expected."originalFilename" and m.mime_type = expected."mimeType"
      and m.extension = expected.extension and m.byte_size = expected."byteSize"
      and m.width = expected.width and m.height = expected.height and m.sha256 = expected.sha256
      and m.rights_status = 'legacy_retained' and m.contains_portrait is null
      and m.portrait_consent = 'not_applicable' and m.published_snapshot_id = v_snapshot_id;
    if v_media_count <> ${record.media.length} or v_matching_media_count <> ${record.media.length} then
      raise exception 'BASELINE_CONFLICT: %:% media metadata differs', ${sqlText(record.contentType)}, ${sqlText(record.publicId)};
    end if;
    update baseline_import_result set skipped = skipped + 1;
  end if;
end
$baseline_record$;`;
}

function buildApplySql(plan) {
  return `begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', ${sqlText(BASELINE_IMPORT_USER_ID)}::uuid,
  'authenticated', 'authenticated', 'baseline-importer@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
) on conflict (id) do nothing;

do $baseline_user$
begin
  if not exists (select 1 from auth.users where id = ${sqlText(BASELINE_IMPORT_USER_ID)}::uuid and email = 'baseline-importer@example.test') then
    raise exception 'BASELINE_CONFLICT: importer auth user differs';
  end if;
end
$baseline_user$;

create temporary table baseline_import_result (inserted integer not null, skipped integer not null, conflicts integer not null);
insert into baseline_import_result values (0, 0, 0);
${plan.records.map(recordSql).join("\n")}
commit;
select json_build_object(
  'inserted', inserted, 'skipped', skipped, 'conflicts', conflicts,
  'contentItems', (select count(*) from public.content_items),
  'snapshots', (select count(*) from public.publication_snapshots),
  'mediaAssets', (select count(*) from public.media_assets),
  'contentDrafts', (select count(*) from public.content_drafts),
  'githubPublications', (select count(*) from public.github_publications)
)::text from baseline_import_result;`;
}

function executePsql(sql) {
  return runDocker(["exec", "-i", DB_CONTAINER, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql });
}

export function applyBaselinePlan(plan, options = {}) {
  assertLocalDatabaseUrl(options.databaseUrl || process.env.YIMI_BASELINE_DB_URL || process.env.SUPABASE_DB_URL || LOCAL_DATABASE_URL);
  verifyLocalContainerPort();
  const lines = executePsql(buildApplySql(plan)).trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

export function queryLocalJson(sql, options = {}) {
  assertLocalDatabaseUrl(options.databaseUrl || process.env.YIMI_BASELINE_DB_URL || process.env.SUPABASE_DB_URL || LOCAL_DATABASE_URL);
  verifyLocalContainerPort();
  const output = executePsql(`select coalesce(json_agg(result), '[]'::json)::text from (${sql}) result;`).trim();
  return JSON.parse(output);
}

export function executeLocalSql(sql, options = {}) {
  assertLocalDatabaseUrl(options.databaseUrl || process.env.YIMI_BASELINE_DB_URL || process.env.SUPABASE_DB_URL || LOCAL_DATABASE_URL);
  verifyLocalContainerPort();
  return executePsql(sql);
}
