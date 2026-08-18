import assert from "node:assert/strict";
import test from "node:test";
import { coreSql, policyBlock } from "./contract-helpers.mjs";

const tables = [
  "admin_users",
  "content_items",
  "content_drafts",
  "media_assets",
  "publication_snapshots",
  "github_publications",
];

test("所有管理 table 啟用 RLS", () => {
  for (const table of tables) {
    assert.match(coreSql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("is_active_admin 使用固定 search_path 並避免 recursive RLS", () => {
  assert.match(coreSql, /create function public\.is_active_admin\(\)[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/i);
  assert.match(coreSql, /from public\.admin_users[\s\S]*user_id = auth\.uid\(\)[\s\S]*is_active = true/i);
  assert.match(coreSql, /revoke all on function public\.is_active_admin\(\) from public/i);
});

test("admin_users 僅允許 active admin SELECT 自己", () => {
  const policy = policyBlock(coreSql, "admin_users_select_self");
  assert.match(policy, /for select/i);
  assert.match(policy, /user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(policy, /is_active_admin\(\)/i);
  assert.match(coreSql, /grant select on table public\.admin_users to authenticated/i);
  assert.doesNotMatch(coreSql, /grant[^;]*(insert|update|delete)[^;]*public\.admin_users[^;]*authenticated/i);
});

test("active admin 可 SELECT/INSERT/UPDATE content、draft、media，但不可 DELETE", () => {
  for (const table of ["content_items", "content_drafts", "media_assets"]) {
    for (const operation of ["select", "insert", "update"]) {
      assert.match(coreSql, new RegExp(`create policy ${table}_${operation}_active_admin`, "i"));
    }
    assert.doesNotMatch(coreSql, new RegExp(`create policy ${table}_delete`, "i"));
  }
});

test("content/draft INSERT 與 UPDATE 綁定 auth.uid", () => {
  assert.match(policyBlock(coreSql, "content_items_insert_active_admin"), /created_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(policyBlock(coreSql, "content_items_update_active_admin"), /created_by\s*=\s*\(select auth\.uid\(\)\)/i);
  const draftInsert = policyBlock(coreSql, "content_drafts_insert_active_admin");
  assert.match(draftInsert, /created_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(draftInsert, /updated_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(policyBlock(coreSql, "content_drafts_update_active_admin"), /updated_by\s*=\s*\(select auth\.uid\(\)\)/i);
});

test("snapshot 與 GitHub publication 對 browser role 僅 SELECT", () => {
  for (const table of ["publication_snapshots", "github_publications"]) {
    assert.match(coreSql, new RegExp(`create policy ${table}_select_active_admin`, "i"));
    assert.match(coreSql, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
    assert.doesNotMatch(coreSql, new RegExp(`grant[^;]*(insert|update|delete)[^;]*public\\.${table}[^;]*authenticated`, "i"));
    assert.doesNotMatch(coreSql, new RegExp(`create policy ${table}_(insert|update|delete)`, "i"));
  }
});

test("匿名與非 admin 沒有任何後台 table policy", () => {
  assert.doesNotMatch(coreSql, /create policy[\s\S]*?to anon/i);
  assert.match(coreSql, /revoke all on table public\.admin_users from anon, authenticated/i);
  assert.ok((coreSql.match(/public\.is_active_admin\(\)/g) ?? []).length >= 11);
});
