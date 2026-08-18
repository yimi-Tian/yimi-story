import assert from "node:assert/strict";
import test from "node:test";
import { policyBlock, storageSql } from "./contract-helpers.mjs";

test("cms-drafts private、cms-public public，限制 10 MB 與三種 MIME", () => {
  assert.match(storageSql, /'cms-drafts'[\s\S]*?false[\s\S]*?10485760/i);
  assert.match(storageSql, /'cms-public'[\s\S]*?true[\s\S]*?10485760/i);
  for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
    assert.ok((storageSql.match(new RegExp(`'${mime}'`, "g")) ?? []).length >= 2);
  }
});

test("匿名不能讀寫 cms-drafts", () => {
  for (const operation of ["select", "insert", "update", "delete"]) {
    const policy = policyBlock(storageSql, `cms_drafts_${operation}_own_active_admin`);
    assert.match(policy, /to authenticated/i);
    assert.doesNotMatch(policy, /\bto anon\b/i);
  }
});

test("active admin 可操作自己的 draft prefix", () => {
  for (const operation of ["select", "insert", "update", "delete"]) {
    const policy = policyBlock(storageSql, `cms_drafts_${operation}_own_active_admin`);
    assert.match(policy, new RegExp(`for ${operation}`, "i"));
    assert.match(policy, /bucket_id\s*=\s*'cms-drafts'/i);
    assert.match(policy, /public\.is_active_admin\(\)/i);
    assert.match(policy, /storage\.foldername\(name\)\)\[1\]\s*=\s*\(select auth\.uid\(\)::text\)/i);
  }
});

test("不同 user_id prefix 不符合 draft policy", () => {
  const ownUser = "11111111-1111-1111-1111-111111111111";
  const otherUser = "22222222-2222-2222-2222-222222222222";
  const path = `${otherUser}/activity/content/asset/original.jpg`;
  assert.notEqual(path.split("/")[0], ownUser);
  assert.match(storageSql, /\(storage\.foldername\(name\)\)\[1\]\s*=\s*\(select auth\.uid\(\)::text\)/i);
});

test("cms-public 可匿名讀取", () => {
  const policy = policyBlock(storageSql, "cms_public_read");
  assert.match(policy, /for select/i);
  assert.match(policy, /to anon, authenticated/i);
  assert.match(policy, /bucket_id\s*=\s*'cms-public'/i);
});

test("browser role 沒有 cms-public 寫入 policy", () => {
  assert.doesNotMatch(storageSql, /create policy cms_public_(insert|update|delete)/i);
  assert.doesNotMatch(storageSql, /bucket_id\s*=\s*'cms-public'[\s\S]*?for (insert|update|delete)/i);
});

test("service role 發布依 Supabase bypass RLS，不建立 browser 寫入例外", () => {
  assert.match(storageSql, /service_role publishing bypasses RLS/i);
  assert.doesNotMatch(storageSql, /to authenticated[\s\S]*bucket_id\s*=\s*'cms-public'[\s\S]*for (insert|update|delete)/i);
});
