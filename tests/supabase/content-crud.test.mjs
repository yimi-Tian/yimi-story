import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migration = await readFile(resolve(import.meta.dirname, "../../supabase/migrations/202608190001_content_crud.sql"), "utf8");

test("第一次編輯原子複製 published snapshot，重複開啟沿用 unique draft", () => {
  assert.match(migration, /create function public\.get_or_create_content_draft/i);
  assert.match(migration, /snapshot\.snapshot_data/i);
  assert.match(migration, /on conflict \(content_id\) do nothing/i);
  assert.match(migration, /select \* into v_draft[\s\S]*where content_id = p_content_id/i);
  assert.match(migration, /revision, status, data[\s\S]*1,[\s\S]*'draft'/i);
});

test("新內容 public ID 在 transaction advisory lock 下配置並原子建立 item 與 draft", () => {
  assert.match(migration, /create function public\.create_content_with_draft/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /CR-' \|\| p_year::text/i);
  assert.match(migration, /lpad\(v_sequence::text, 3, '0'\)/i);
  assert.match(migration, /insert into public\.content_items[\s\S]*insert into public\.content_drafts/i);
  assert.doesNotMatch(migration, /commit;[\s\S]*insert into public\.content_drafts/i);
});

test("RPC固定 created_by與updated_by為 auth.uid 且只授權 authenticated", () => {
  assert.ok((migration.match(/auth\.uid\(\)/gi) ?? []).length >= 5);
  assert.match(migration, /revoke all on function public\.get_or_create_content_draft\(uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.create_content_with_draft[\s\S]*to authenticated, service_role/i);
});

test("Stage 5B-1 migration 不寫 snapshot、media 或 GitHub publication", () => {
  assert.doesNotMatch(migration, /insert into public\.(publication_snapshots|media_assets|github_publications)/i);
  assert.doesNotMatch(migration, /update public\.(publication_snapshots|media_assets|github_publications)/i);
  assert.doesNotMatch(migration, /delete from/i);
});
