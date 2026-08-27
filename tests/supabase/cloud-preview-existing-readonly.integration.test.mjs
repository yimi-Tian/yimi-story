import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "../../admin/node_modules/@supabase/supabase-js/dist/index.mjs";

const enabled = process.env.YIMI_RUN_CLOUD_PREVIEW_READONLY === "1";
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Stage 6 production 112-015 preview inputs remain read-only", { skip: !enabled, timeout: 30_000 }, async () => {
  const url=process.env.YIMI_CLOUD_SUPABASE_URL,serviceKey=process.env.YIMI_CLOUD_SERVICE_ROLE_KEY;
  assert.ok(url&&serviceKey,"cloud preview read-only env required");
  const client=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const counts=async()=>{const exact=async(table)=>{const{count,error}=await client.from(table).select("id",{count:"exact",head:true});if(error)throw error;return count??0;};return{items:await exact("content_items"),snapshots:await exact("publication_snapshots"),drafts:await exact("content_drafts"),media:await exact("media_assets"),publications:await exact("github_publications")};};
  const read=async()=>{
    const item=await client.from("content_items").select("id,published_snapshot_id").eq("content_type","activity").eq("public_id","112-015").single();assert.equal(item.error,null);
    const snapshot=await client.from("publication_snapshots").select("snapshot_data").eq("id",item.data.published_snapshot_id).single();assert.equal(snapshot.error,null);
    const media=await client.from("media_assets").select("id,content_id,draft_id,source,role,sort_order,legacy_path,legacy_asset_key,alt_text,rights_status,contains_portrait,deleted_at").eq("content_id",item.data.id).order("sort_order");assert.equal(media.error,null);
    return{snapshot:snapshot.data.snapshot_data,media:media.data};
  };
  const beforeCounts=await counts(),before=await read();
  assert.equal(before.snapshot.coverAssetId,null);
  assert.ok(before.snapshot.galleryAssetIds.length>0);
  const first=before.media.find((row)=>row.legacy_asset_key===before.snapshot.galleryAssetIds[0]);
  assert.ok(first);assert.match(first.legacy_path,/\/112-015\/01\.jpg$/i);
  const after=await read();
  assert.deepEqual(await counts(),beforeCounts);
  assert.equal(digest(after.snapshot),digest(before.snapshot));
  assert.equal(digest(after.media),digest(before.media));
});
