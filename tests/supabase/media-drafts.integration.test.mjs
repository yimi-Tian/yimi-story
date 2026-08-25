import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "../../admin/node_modules/@supabase/supabase-js/dist/index.mjs";

const enabled=process.env.YIMI_RUN_MEDIA_INTEGRATION==="1";
const makeClient=(url,key)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Origin:"http://localhost:5173"}}});
const png=()=>{const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10],0);b.set([73,72,68,82],12);new DataView(b.buffer).setUint32(16,640);new DataView(b.buffer).setUint32(20,480);return b;};

test("Stage 5B-2 local Storage、signed URL、media attach/metadata/detach/delete 與RLS",{skip:!enabled,timeout:120_000},async()=>{
  const url=process.env.YIMI_LOCAL_SUPABASE_URL,key=process.env.YIMI_LOCAL_ANON_KEY,serviceKey=process.env.YIMI_LOCAL_SERVICE_ROLE_KEY;
  assert.ok(url&&key&&serviceKey,"local Supabase env required"); const service=makeClient(url,serviceKey);
  const suffix=randomUUID().slice(0,8),password=`Safe-${randomUUID()}!`; const users=[]; const objects=[]; let contentId=null,draftId=null,mediaId=randomUUID();
  const createUser=async(kind,isAdmin=null)=>{const email=`media-${kind}-${suffix}@example.test`;const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;users.push(data.user.id);if(isAdmin!==null){const {error:e}=await service.from("admin_users").insert({user_id:data.user.id,email,is_active:isAdmin});if(e)throw e;}const signed=makeClient(url,key);const {error:s}=await signed.auth.signInWithPassword({email,password});if(s)throw s;return{client:signed,id:data.user.id};};
  const active=await createUser("active",true),inactive=await createUser("inactive",false),nonAdmin=await createUser("user");
  try{
    {const {data,error}=await service.from("content_items").insert({content_type:"class_result",public_id:`CR-TEST-MEDIA-${suffix}`,created_by:active.id}).select("id").single();if(error)throw error;contentId=data.id;}
    {const {data,error}=await service.from("content_drafts").insert({content_id:contentId,data:{coverAssetId:null,galleryAssetIds:[]},created_by:active.id,updated_by:active.id}).select("id").single();if(error)throw error;draftId=data.id;}
    const path=`${active.id}/${contentId}/${mediaId}/${mediaId}.png`;objects.push(path);
    assert.equal((await active.client.storage.from("cms-drafts").upload(path,png(),{contentType:"image/png"})).error,null);
    const signed=await active.client.storage.from("cms-drafts").createSignedUrl(path,900);assert.equal(signed.error,null);assert.match(signed.data.signedUrl,/token=/);
    const otherPath=`${inactive.id}/${contentId}/${randomUUID()}/blocked.png`;assert.ok((await active.client.storage.from("cms-drafts").upload(otherPath,png(),{contentType:"image/png"})).error);
    for(const identity of [inactive,nonAdmin]){const blocked=`${identity.id}/${contentId}/${randomUUID()}/blocked.png`;assert.ok((await identity.client.storage.from("cms-drafts").upload(blocked,png(),{contentType:"image/png"})).error);}
    assert.ok((await makeClient(url,key).storage.from("cms-drafts").upload(`anon/${contentId}/blocked.png`,png(),{contentType:"image/png"})).error);
    const invoked=await active.client.functions.invoke("validate-media-upload",{body:{contentId,draftId,mediaId,bucket:"cms-drafts",objectPath:path,role:"cover",originalFilename:"local.png",declaredMimeType:"image/png"}});assert.equal(invoked.error,null);assert.equal(invoked.data.media.source,"cms_draft");
    const attached=await active.client.rpc("save_content_draft_with_media",{p_draft_id:draftId,p_data:{coverAssetId:mediaId,galleryAssetIds:[]},p_validation_result:{valid:false,errors:[],warnings:[]},p_status:"draft",p_media_metadata:[{id:mediaId,altText:"本機測試圖",containsPortrait:"no",rightsStatus:"owned"}]});assert.equal(attached.error,null);assert.equal(attached.data.revision,2);
    const {data:media}=await active.client.from("media_assets").select("alt_text,contains_portrait,rights_status").eq("id",mediaId).single();assert.deepEqual(media,{alt_text:"本機測試圖",contains_portrait:false,rights_status:"owned"});
    assert.ok((await active.client.rpc("delete_unreferenced_draft_media",{p_media_id:mediaId})).error,"referenced media cannot delete");
    const detached=await active.client.rpc("save_content_draft_with_media",{p_draft_id:draftId,p_data:{coverAssetId:null,galleryAssetIds:[]},p_validation_result:{valid:false,errors:[],warnings:[]},p_status:"draft",p_media_metadata:[]});assert.equal(detached.error,null);assert.equal(detached.data.revision,3);
    assert.equal((await active.client.storage.from("cms-drafts").remove([path])).error,null);assert.equal((await active.client.rpc("delete_unreferenced_draft_media",{p_media_id:mediaId})).data,true);
    assert.equal((await service.from("media_assets").select("id",{count:"exact",head:true}).eq("id",mediaId)).count,0);
  }finally{
    if(objects.length)await service.storage.from("cms-drafts").remove(objects);
    if(contentId)await service.from("content_items").delete().eq("id",contentId);
    if(users.length){await service.from("admin_users").delete().in("user_id",users);for(const id of users)await service.auth.admin.deleteUser(id);}
  }
});
