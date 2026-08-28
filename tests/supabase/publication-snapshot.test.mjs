import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../../supabase/migrations/202608280002_publication_snapshot_workflow.sql",import.meta.url),"utf8");
test("migration保留baseline並新增draft publication payload與唯一鍵",()=>{assert.match(sql,/add column public_data jsonb/i);assert.match(sql,/add column publication_validation jsonb/i);assert.match(sql,/where snapshot_source = 'draft'/i);const beforeFunction=sql.slice(0,sql.indexOf("create function public.canonical_jsonb_text"));assert.doesNotMatch(beforeFunction,/(update|delete from|insert into) public\.(content_items|content_drafts|media_assets|publication_snapshots)/i);});
test("RPC限service role、鎖revision並拒絕projection manifest checksum差異",()=>{assert.match(sql,/auth\.role\(\).*service_role/is);assert.match(sql,/for update/i);assert.match(sql,/draft revision changed/i);assert.match(sql,/public projection mismatch/i);assert.match(sql,/media manifest mismatch/i);assert.match(sql,/publication checksum mismatch/i);assert.match(sql,/revoke all on function public\.prepare_publication_snapshot[\s\S]*grant execute[\s\S]*service_role/i);});
test("RPC不切published pointer、不寫Storage GitHub或草稿",()=>{const body=sql.slice(sql.indexOf("create function public.prepare_publication_snapshot"));assert.doesNotMatch(body,/update public\.content_items/i);assert.doesNotMatch(body,/(insert into|update|delete from) public\.(content_drafts|media_assets|github_publications)/i);assert.doesNotMatch(body,/(insert into|update|delete from) storage\.objects/i);});
