import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "../../admin/node_modules/@supabase/supabase-js/dist/index.mjs";

const enabled=process.env.YIMI_RUN_CLOUD_MEDIA_INTEGRATION==="1";
const origin="https://yimi-story-admin.pages.dev";
const makeClient=(url,key)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Origin:origin}}});
const png=(width)=>{const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10],0);b.set([73,72,68,82],12);new DataView(b.buffer).setUint32(16,width);new DataView(b.buffer).setUint32(20,480);return b;};
async function counts(service){const exact=async(table,configure=(q)=>q)=>{const{count,error}=await configure(service.from(table).select("id",{count:"exact",head:true}));if(error)throw error;return count??0;};return{items:await exact("content_items"),snapshots:await exact("publication_snapshots"),drafts:await exact("content_drafts"),media:await exact("media_assets"),legacy:await exact("media_assets",(q)=>q.eq("source","github_legacy")),publications:await exact("github_publications")};}
async function legacyDigest(service){const{data,error}=await service.from("media_assets").select("id,content_id,source,role,sort_order,legacy_path,original_filename,mime_type,byte_size,width,height,sha256,alt_text,rights_status,contains_portrait,legacy_asset_key,published_snapshot_id").eq("source","github_legacy").order("id");if(error)throw error;return createHash("sha256").update(JSON.stringify(data)).digest("hex");}

test("production Cloud Stage 5B-2 temporary media完整生命週期與精確清理",{skip:!enabled,timeout:120_000},async()=>{
  const url=process.env.YIMI_CLOUD_SUPABASE_URL,key=process.env.YIMI_CLOUD_PUBLISHABLE_KEY,serviceKey=process.env.YIMI_CLOUD_SERVICE_ROLE_KEY;assert.ok(url&&key&&serviceKey,"Cloud media env missing");
  const service=makeClient(url,serviceKey),before=await counts(service),legacyBefore=await legacyDigest(service);assert.deepEqual(before,{items:119,snapshots:119,drafts:0,media:714,legacy:714,publications:0});
  const suffix=randomUUID().slice(0,8),password=`Safe-${randomUUID()}!`,users=[],objects=[],mediaIds=[];let contentId=null,draftId=null;
  const identity=async(kind,isAdmin=null)=>{const email=`cloud-media-${kind}-${suffix}@example.test`;const{data,error}=await service.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;users.push(data.user.id);if(isAdmin!==null){const{error:e}=await service.from("admin_users").insert({user_id:data.user.id,email,is_active:isAdmin});if(e)throw e;}const client=makeClient(url,key);const{error:s}=await client.auth.signInWithPassword({email,password});if(s)throw s;return{client,id:data.user.id};};
  const active=await identity("active",true),inactive=await identity("inactive",false),nonAdmin=await identity("user");
  try{
    {const{data,error}=await service.from("content_items").insert({content_type:"class_result",public_id:`CR-TEST-MEDIA-${suffix}`,created_by:active.id}).select("id").single();if(error)throw error;contentId=data.id;}
    {const{data,error}=await service.from("content_drafts").insert({content_id:contentId,data:{coverAssetId:null,galleryAssetIds:[]},created_by:active.id,updated_by:active.id}).select("id").single();if(error)throw error;draftId=data.id;}
    for(const width of [640,641]){const mediaId=randomUUID(),path=`${active.id}/${contentId}/${mediaId}/${mediaId}.png`;mediaIds.push(mediaId);objects.push(path);assert.equal((await active.client.storage.from("cms-drafts").upload(path,png(width),{contentType:"image/png"})).error,null);const invoke=await active.client.functions.invoke("validate-media-upload",{body:{contentId,draftId,mediaId,bucket:"cms-drafts",objectPath:path,role:"gallery",originalFilename:`cloud-${width}.png`,declaredMimeType:"image/png"}});assert.equal(invoke.error,null);assert.equal(invoke.data.media.width,width);assert.equal((await active.client.storage.from("cms-drafts").createSignedUrl(path,900)).error,null);}
    const forbidden=`${inactive.id}/${contentId}/${randomUUID()}/blocked.png`;assert.ok((await active.client.storage.from("cms-drafts").upload(forbidden,png(640),{contentType:"image/png"})).error);for(const identity of [inactive,nonAdmin]){const result=await identity.client.from("media_assets").select("id").limit(1);assert.equal(result.error,null);assert.equal(result.data.length,0);}
    assert.ok((await active.client.storage.from("cms-public").upload(`blocked-${suffix}.png`,png(640),{contentType:"image/png"})).error);
    const save=async(ids)=>active.client.rpc("save_content_draft_with_media",{p_draft_id:draftId,p_data:{coverAssetId:null,galleryAssetIds:ids},p_validation_result:{valid:false,errors:[],warnings:[]},p_status:"draft",p_media_metadata:mediaIds.map((id,index)=>({id,altText:`Cloud gallery ${index+1}`,containsPortrait:index?"yes":"no",rightsStatus:index?"authorized":"owned"}))});
    const attached=await save(mediaIds);assert.equal(attached.error,null);assert.equal(attached.data.revision,2);const reordered=await save([...mediaIds].reverse());assert.equal(reordered.error,null);assert.equal(reordered.data.revision,3);assert.deepEqual(reordered.data.data.galleryAssetIds,[...mediaIds].reverse());
    const detached=await active.client.rpc("save_content_draft_with_media",{p_draft_id:draftId,p_data:{coverAssetId:null,galleryAssetIds:[]},p_validation_result:{valid:false,errors:[],warnings:[]},p_status:"draft",p_media_metadata:[]});assert.equal(detached.error,null);
    for(let i=0;i<mediaIds.length;i++){assert.equal((await active.client.storage.from("cms-drafts").remove([objects[i]])).error,null);assert.equal((await active.client.rpc("delete_unreferenced_draft_media",{p_media_id:mediaIds[i]})).data,true);}
  }finally{
    if(objects.length)await service.storage.from("cms-drafts").remove(objects);if(contentId)await service.from("content_items").delete().eq("id",contentId);
    if(users.length){await service.from("admin_users").delete().in("user_id",users);for(const id of users)await service.auth.admin.deleteUser(id);}
  }
  assert.deepEqual(await counts(service),before);assert.equal(await legacyDigest(service),legacyBefore);const{data:remaining,error:listError}=await service.storage.from("cms-drafts").list(active.id,{limit:100});assert.equal(listError,null);assert.equal(remaining.length,0);
});
