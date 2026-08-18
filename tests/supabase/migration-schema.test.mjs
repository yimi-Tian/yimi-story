import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineSql,
  coreSql,
  enumValues,
  migrationFiles,
  read,
  storageSql,
} from "./contract-helpers.mjs";

test("migration 採穩定順序且不含 destructive drop", () => {
  assert.deepEqual(migrationFiles, [
    "202608180001_admin_foundation.sql",
    "202608180002_storage_policies.sql",
    "202608180003_baseline_import_support.sql",
  ]);
  assert.doesNotMatch(`${coreSql}\n${storageSql}\n${baselineSql}`, /\bdrop\s+(table|type|schema)\b/i);
  for (const sql of [coreSql, storageSql, baselineSql]) {
    assert.match(sql, /^begin;/i);
    assert.match(sql, /commit;\s*$/i);
  }
});

test("9 個 enum 與值符合 V1 契約", () => {
  assert.deepEqual(enumValues(coreSql, "content_type"), ["class_result", "activity"]);
  assert.deepEqual(enumValues(coreSql, "draft_status"), ["draft", "validated"]);
  assert.deepEqual(enumValues(coreSql, "publication_status"), [
    "ready", "creating_pr", "pr_open", "pr_merged", "pr_closed", "failed",
  ]);
  assert.deepEqual(enumValues(coreSql, "media_source"), ["github_legacy", "supabase_upload"]);
  assert.deepEqual(enumValues(coreSql, "media_role"), ["cover", "gallery"]);
  assert.deepEqual(enumValues(coreSql, "media_rights_status"), ["pending", "confirmed", "legacy_retained"]);
  assert.deepEqual(enumValues(coreSql, "portrait_consent_status"), ["not_applicable", "confirmed", "pending"]);
  assert.deepEqual(enumValues(coreSql, "media_upload_status"), ["uploaded", "ready", "failed"]);
  assert.deepEqual(enumValues(coreSql, "github_publication_state"), ["creating", "open", "merged", "closed", "failed"]);
});

test("6 張主要 table 全部建立", () => {
  for (const table of [
    "admin_users",
    "content_items",
    "content_drafts",
    "media_assets",
    "publication_snapshots",
    "github_publications",
  ]) {
    assert.match(coreSql, new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i"));
  }
});

test("content item ID 與 active draft 唯一限制存在", () => {
  assert.match(coreSql, /unique\s*\(content_type,\s*public_id\)/i);
  assert.match(coreSql, /unique\s*\(content_id\)/i);
  assert.match(coreSql, /public_id[^,]+check\s*\(length\(btrim\(public_id\)\)\s*>\s*0\)/i);
});

test("media metadata 尺寸、來源與肖像同意 checks 完整", () => {
  assert.match(coreSql, /byte_size\s+bigint\s+not null\s+check\s*\(byte_size\s*>=\s*0\)/i);
  assert.match(coreSql, /width\s+integer\s+check\s*\(width is null or width\s*>\s*0\)/i);
  assert.match(coreSql, /height\s+integer\s+check\s*\(height is null or height\s*>\s*0\)/i);
  assert.match(coreSql, /media_assets_legacy_source_check/i);
  assert.match(coreSql, /legacy_path is not null[\s\S]*length\(btrim\(legacy_path\)\)\s*>\s*0/i);
  assert.match(coreSql, /media_assets_upload_source_check/i);
  assert.match(coreSql, /bucket is not null[\s\S]*object_path is not null/i);
  assert.match(coreSql, /media_assets_portrait_consent_check/i);
});

test("publication circular foreign keys 在 snapshot table 後補上", () => {
  const snapshotPosition = coreSql.indexOf("create table public.publication_snapshots");
  const contentAlterPosition = coreSql.indexOf("alter table public.content_items");
  const mediaAlterPosition = coreSql.indexOf("alter table public.media_assets");
  assert.ok(snapshotPosition >= 0);
  assert.ok(contentAlterPosition > snapshotPosition);
  assert.ok(mediaAlterPosition > snapshotPosition);
  assert.match(coreSql, /content_items_published_snapshot_id_fkey[\s\S]*references public\.publication_snapshots\(id\)/i);
  assert.match(coreSql, /media_assets_published_snapshot_id_fkey[\s\S]*references public\.publication_snapshots\(id\)/i);
});

test("updated_at 與 draft revision triggers 只在 update 執行", () => {
  assert.match(coreSql, /create function public\.set_updated_at\(\)/i);
  assert.match(coreSql, /new\.updated_at\s*=\s*now\(\)/i);
  assert.match(coreSql, /create function public\.increment_draft_revision\(\)/i);
  assert.match(coreSql, /new\.revision\s*=\s*old\.revision\s*\+\s*1/i);
  assert.equal((coreSql.match(/before update on public\.(admin_users|content_items|content_drafts)/gi) ?? []).length, 4);
  assert.doesNotMatch(coreSql, /before insert[\s\S]*increment_draft_revision/i);
});

test("Auth config 關閉 public signup 且 env 範本沒有真實 secret", () => {
  const config = read("supabase/config.toml");
  const envExample = read(".env.example");
  assert.match(config, /\[auth\][\s\S]*?enable_signup\s*=\s*false/i);
  assert.match(config, /\[auth\.email\][\s\S]*?enable_signup\s*=\s*true/i);
  assert.match(config, /enable_anonymous_sign_ins\s*=\s*false/i);
  assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=server-only/);
  assert.doesNotMatch(envExample, /gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_|eyJ[A-Za-z0-9_-]{20,}\./);
});
