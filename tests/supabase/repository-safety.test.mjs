import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./contract-helpers.mjs";

test(".gitignore 不隱藏既有 public 素材", () => {
  const ignore = read(".gitignore");
  assert.match(ignore, /(^|\n)supabase\/\.temp\//i);
  assert.match(ignore, /(^|\n)supabase\/\.branches\//i);
  assert.doesNotMatch(ignore, /(^|\n)\/?public\/(images|docs)\/?(\n|$)/i);
  assert.doesNotMatch(ignore, /(^|\n)\/?public\//i);
});

test("seed 不含正式資料、真實帳號或密碼", () => {
  const seed = read("supabase/seed.sql");
  assert.doesNotMatch(seed, /insert\s+into\s+(auth\.users|public\.content_items|public\.content_drafts)/i);
  assert.doesNotMatch(seed, /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|password\s*=/i);
});

test("Edge Function config 僅 health 關閉 gateway JWT 驗證", () => {
  const config = read("supabase/config.toml");
  assert.match(config, /\[functions\.admin-health\]\s*verify_jwt\s*=\s*false/i);
  assert.match(config, /\[functions\.validate-admin\]\s*verify_jwt\s*=\s*true/i);
});
