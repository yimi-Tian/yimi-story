import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "../../admin/node_modules/@supabase/supabase-js/dist/index.mjs";
import { projectActivityPublicData, projectClassResultPublicData } from "../../tools/content/public-projection.mjs";

const SELECT = "id,content_type,public_id,published_snapshot_id,drafts:content_drafts(id,revision,status,data,validation_result),published:publication_snapshots!content_items_published_snapshot_id_fkey(id,snapshot_data)";
const png = () => { const value = new Uint8Array(24); value.set([137,80,78,71,13,10,26,10],0); value.set([73,72,68,82],12); new DataView(value.buffer).setUint32(16,640); new DataView(value.buffer).setUint32(20,480); return value; };
const makeClient = (url, key, origin) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Origin: origin } } });

async function exact(service, table, configure = (query) => query) {
  const { count, error } = await configure(service.from(table).select("id", { count: "exact", head: true }));
  if (error) throw error;
  return count ?? 0;
}
async function counts(service) {
  return { items: await exact(service,"content_items"), snapshots: await exact(service,"publication_snapshots"), drafts: await exact(service,"content_drafts"),
    media: await exact(service,"media_assets"), legacy: await exact(service,"media_assets",(q)=>q.eq("source","github_legacy")), publications: await exact(service,"github_publications") };
}
async function legacyDigest(service) {
  const { data, error } = await service.from("media_assets").select("id,content_id,source,role,sort_order,legacy_path,original_filename,mime_type,byte_size,width,height,sha256,alt_text,rights_status,contains_portrait,legacy_asset_key,published_snapshot_id").eq("source","github_legacy").order("id");
  if (error) throw error;
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

export async function runPreviewIntegration({ url, publishableKey, serviceKey, origin, expectedBaseline, expectedLegacyDigest = null }) {
  const service = makeClient(url, serviceKey, origin);
  const before = await counts(service);
  assert.deepEqual(before, expectedBaseline);
  const digestBefore = await legacyDigest(service);
  if (expectedLegacyDigest) assert.equal(digestBefore, expectedLegacyDigest);
  const suffix = randomUUID().slice(0,8), password = `Safe-${randomUUID()}!`, users = [], objects = [];
  const contentIds = [];
  const identity = async (kind, isAdmin = null) => {
    const email = `preview-${kind}-${suffix}@example.test`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error;
    users.push(data.user.id);
    if (isAdmin !== null) { const { error: adminError } = await service.from("admin_users").insert({ user_id: data.user.id, email, is_active: isAdmin }); if (adminError) throw adminError; }
    const client = makeClient(url, publishableKey, origin); const { error: signInError } = await client.auth.signInWithPassword({ email, password }); if (signInError) throw signInError;
    return { client, id: data.user.id };
  };
  const active = await identity("active", true), inactive = await identity("inactive", false), nonAdmin = await identity("non-admin");
  const createDraft = async (type) => {
    const publicId = type === "class_result" ? `TEST-PREVIEW-CLASS-${suffix}` : `TEST-PREVIEW-ACTIVITY-${suffix}`;
    const { data: item, error: itemError } = await service.from("content_items").insert({ content_type: type, public_id: publicId, created_by: active.id }).select("id").single(); if (itemError) throw itemError;
    contentIds.push(item.id);
    const initial = type === "class_result"
      ? { id: publicId, year: 115, title: "Stage 6 預覽班級", className: "預覽課程", instructor: "預覽講師", description: "公開內容", districts: ["民雄鄉"], venue: "預覽場地", tags: ["測試"], sdgs: ["SDG 11"], displayOrder: 1, internalNotes: "SECRET-INTERNAL-NOTE-TEST", publicNotes: "公開備註", coverAssetId: null, galleryAssetIds: [] }
      : { id: publicId, year: 115, name: "Stage 6 預覽活動", startDate: null, endDate: null, dateLabel: "115年測試日期", districts: ["水上鄉"], venue: "預覽場地", projectName: "預覽計畫", activityType: "成果", topic: "地方", sdgs: ["SDG 4"], summary: "公開摘要", participants: 12, partnerOrganizations: null, leader: "預覽講師", keywords: ["測試"], videoUrl: null, relatedUrl: null, featured: false, internalNotes: "SECRET-INTERNAL-NOTE-TEST", publicNotes: "公開備註", coverAssetId: null, galleryAssetIds: [] };
    const { data: draft, error: draftError } = await service.from("content_drafts").insert({ content_id: item.id, data: initial, created_by: active.id, updated_by: active.id }).select("id").single(); if (draftError) throw draftError;
    const draftIds = [randomUUID(), randomUUID()];
    const legacyKey = `${publicId}:legacy`;
    const cmsRole = type === "class_result" ? "gallery" : "cover";
    for (const [index, mediaId] of draftIds.entries()) {
      const role = cmsRole === "cover" ? (index === 0 ? "cover" : "gallery") : "gallery";
      const path = `${active.id}/${item.id}/${mediaId}/${mediaId}.png`; objects.push(path);
      const bytes = png(); const { error: uploadError } = await service.storage.from("cms-drafts").upload(path, bytes, { contentType: "image/png" }); if (uploadError) throw uploadError;
      const sha256 = createHash("sha256").update(Buffer.from(bytes)).update(`${type}-${index}`).digest("hex");
      const { error: mediaError } = await service.from("media_assets").insert({ id: mediaId, content_id: item.id, draft_id: draft.id, source: "cms_draft", role, sort_order: index, bucket: "cms-drafts", object_path: path, original_filename: `private-${index}.png`, mime_type: "image/png", extension: "png", byte_size: bytes.length, width: 640, height: 480, sha256, alt_text: index ? "" : "預覽圖片", rights_status: index ? "unknown" : "owned", contains_portrait: false, portrait_consent: "not_applicable", upload_status: "ready", created_by: active.id }); if (mediaError) throw mediaError;
    }
    const { error: legacyError } = await service.from("media_assets").insert({ content_id: item.id, source: "github_legacy", role: type === "class_result" ? "cover" : "gallery", sort_order: 9, legacy_path: "public/images/placeholder.jpg", legacy_asset_key: legacyKey, original_filename: "legacy.jpg", mime_type: "image/jpeg", extension: "jpg", byte_size: 1, width: 640, height: 480, sha256: "a".repeat(64), alt_text: "既有公開圖片", rights_status: "legacy_retained", contains_portrait: null, portrait_consent: "not_applicable", upload_status: "ready" }); if (legacyError) throw legacyError;
    const data = type === "class_result" ? { ...initial, coverAssetId: legacyKey, galleryAssetIds: [...draftIds].reverse() } : { ...initial, coverAssetId: draftIds[0], galleryAssetIds: [legacyKey, draftIds[1]] };
    const { error: updateError } = await service.from("content_drafts").update({ data, validation_result: { valid: true, errors: [], warnings: [] } }).eq("id", draft.id); if (updateError) throw updateError;
    return { publicId, data, draftIds };
  };
  try {
    const anonymous = await makeClient(url,publishableKey,origin).from("content_items").select("id").limit(1);
    assert.ok(anonymous.error || anonymous.data.length === 0, "anonymous must not read preview content");
    for (const blocked of [inactive.client, nonAdmin.client]) { const result = await blocked.from("content_items").select("id").limit(1); assert.equal(result.error,null); assert.equal(result.data.length,0); }
    const publishedBefore = await counts(service);
    for (const [type, id] of [["class_result","CR-115-039"],["activity","112-015"]]) {
      const { data, error } = await active.client.from("content_items").select(SELECT).eq("content_type",type).eq("public_id",id).maybeSingle(); assert.equal(error,null); assert.ok(data); assert.ok(!data.drafts || data.drafts.length === 0); assert.ok(data.published);
      if(id==="112-015"){
        const snapshot=Array.isArray(data.published)?data.published[0]:data.published;
        assert.equal(snapshot.snapshot_data.coverAssetId,null);
        assert.ok(snapshot.snapshot_data.galleryAssetIds.length>0);
        const firstReference=snapshot.snapshot_data.galleryAssetIds[0];
        const firstMedia=await active.client.from("media_assets").select("legacy_path").eq("content_id",data.id).eq("legacy_asset_key",firstReference).single();
        assert.equal(firstMedia.error,null);assert.match(firstMedia.data.legacy_path,/\/112-015\/01\.jpg$/i);
      }
    }
    assert.deepEqual(await counts(service), publishedBefore, "published-only preview must not write or create drafts");
    const created = [await createDraft("class_result"), await createDraft("activity")];
    for (const entry of created) {
      const type = entry.publicId.includes("CLASS") ? "class_result" : "activity";
      const { data: row, error } = await active.client.from("content_items").select(SELECT).eq("content_type",type).eq("public_id",entry.publicId).maybeSingle(); assert.equal(error,null); const draftRow=Array.isArray(row.drafts)?row.drafts[0]:row.drafts; assert.ok(draftRow); assert.equal(row.published,null);
      const publicData = type === "class_result" ? projectClassResultPublicData(draftRow.data) : projectActivityPublicData(draftRow.data);
      assert.equal(JSON.stringify(publicData).includes("SECRET-INTERNAL-NOTE-TEST"),false); assert.equal("internalNotes" in publicData,false);
      for (const mediaId of entry.draftIds) { const { data: mediaRow, error: mediaError } = await active.client.from("media_assets").select("object_path").eq("id",mediaId).single(); assert.equal(mediaError,null); const signed = await active.client.storage.from("cms-drafts").createSignedUrl(mediaRow.object_path,900); assert.equal(signed.error,null); assert.match(signed.data.signedUrl,/token=/); }
    }
  } finally {
    if (objects.length) await service.storage.from("cms-drafts").remove(objects);
    if (contentIds.length) await service.from("content_items").delete().in("id",contentIds);
    if (users.length) { await service.from("admin_users").delete().in("user_id",users); for (const id of users) await service.auth.admin.deleteUser(id); }
  }
  assert.deepEqual(await counts(service),before);
  assert.equal(await legacyDigest(service),digestBefore);
  const { data: remaining, error: listError } = await service.storage.from("cms-drafts").list(active.id,{limit:100}); assert.equal(listError,null); assert.equal(remaining.length,0);
  return { classTestId: `TEST-PREVIEW-CLASS-${suffix}`, activityTestId: `TEST-PREVIEW-ACTIVITY-${suffix}` };
}
