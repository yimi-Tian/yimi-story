import test from "node:test";
import assert from "node:assert/strict";
import { read } from "./contract-helpers.mjs";

const enums=read("supabase/migrations/202608190002_media_draft_enums.sql");
const sql=read("supabase/migrations/202608190003_media_drafts.sql");
test("Stage 5B-2明確區分cms_draft/cms_public且不改legacy來源",()=>{
  assert.match(enums,/alter type public\.media_source add value if not exists 'cms_draft'/i);assert.match(enums,/add value if not exists 'cms_public'/i);
  assert.doesNotMatch(sql,/\bset\s+source\s*=/i);
});
test("metadata補ownership、updated_at與同content checksum防重",()=>{
  assert.match(sql,/add column created_by uuid references auth\.users/i);assert.match(sql,/add column updated_at timestamptz/i);assert.match(sql,/media_assets_draft_checksum_idx[\s\S]*content_id, sha256/i);
  assert.match(sql,/source <> 'cms_draft'[\s\S]*created_by is not null/i);
  assert.doesNotMatch(sql,/update public\.media_assets media\s+set created_by/i);
});
test("canonical refs由trigger驗證content/draft ownership且新gallery最多20",()=>{
  assert.match(sql,/validate_content_draft_media_refs/i);assert.match(sql,/media\.legacy_asset_key = refs\.reference/i);assert.match(sql,/media\.draft_id = new\.id/i);assert.match(sql,/v_new_gallery_count > 20/i);
  assert.match(sql,/media\.role::text = refs\.expected_role/i);
});
test("草稿與metadata單次RPC交易更新且只允許三個metadata欄位",()=>{
  assert.match(sql,/save_content_draft_with_media/i);for(const field of ["alt_text","contains_portrait","rights_status"])assert.match(sql,new RegExp(field,"i"));
  const metadataSet=/update public\.media_assets\s+set([\s\S]*?)\s+where id =/i.exec(sql)?.[1]??"";
  assert.doesNotMatch(metadataSet,/\b(source|bucket|object_path|sha256|byte_size)\s*=/i);
});
test("browser不可直接寫media，刪除只允許未引用cms_draft",()=>{
  assert.match(sql,/revoke insert, update, delete on table public\.media_assets from authenticated/i);assert.match(sql,/delete_unreferenced_draft_media/i);assert.match(sql,/source = 'cms_draft'/i);assert.match(sql,/published_snapshot_id is null/i);assert.match(sql,/media is still referenced/i);
});
test("Stage 5B-2不寫published snapshot、github publication或legacy檔案",()=>{
  assert.doesNotMatch(sql,/(insert into|update|delete from) public\.(publication_snapshots|github_publications)/i);assert.doesNotMatch(sql,/storage\.objects[\s\S]*(insert|update|delete)/i);
});
