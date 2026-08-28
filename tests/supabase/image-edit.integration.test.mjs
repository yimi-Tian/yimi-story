import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "../../admin/node_modules/@supabase/supabase-js/dist/index.mjs";
import { applyBaselinePlan } from "../../tools/baseline/baseline-db.mjs";
import { buildBaselinePlan } from "../../tools/baseline/build-baseline.mjs";

const enabled=process.env.YIMI_RUN_IMAGE_EDIT_INTEGRATION==="1";
const client=(url,key)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Origin:"http://localhost:5173"}}});
const png=()=>{const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10],0);b.set([73,72,68,82],12);new DataView(b.buffer).setUint32(16,640);new DataView(b.buffer).setUint32(20,480);return b;};

test("Stage 6.5 local derived attach/restore、revision、RLS與orphan安全",{skip:!enabled,timeout:120_000},async()=>{
  const url=process.env.YIMI_LOCAL_SUPABASE_URL,key=process.env.YIMI_LOCAL_ANON_KEY,serviceKey=process.env.YIMI_LOCAL_SERVICE_ROLE_KEY;assert.ok(url&&key&&serviceKey,"local image edit env required");
  applyBaselinePlan(await buildBaselinePlan());const service=client(url,serviceKey),suffix=randomUUID().slice(0,8),password=`Safe-${randomUUID()}!`,users=[],objects=[];let contentId=null,draftId=null;
  const identity=async(kind,isAdmin=null)=>{const email=`image-edit-${kind}-${suffix}@example.test`;const{data,error}=await service.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;users.push(data.user.id);if(isAdmin!==null){const{error:e}=await service.from("admin_users").insert({user_id:data.user.id,email,is_active:isAdmin});if(e)throw e;}const signed=client(url,key);const{error:s}=await signed.auth.signInWithPassword({email,password});if(s)throw s;return{client:signed,id:data.user.id};};
  const active=await identity("active",true),inactive=await identity("inactive",false),nonAdmin=await identity("user");
  const ids={cover:randomUUID(),gallery:randomUUID(),galleryTwo:randomUUID(),coverEdited:randomUUID(),galleryEdited:randomUUID()};
  const transform={rotation:90,crop:{x:0,y:0,width:1,height:1,aspectRatio:"original"},normalizedOrientation:true,originalOrientation:6};
  try{
    {const{data,error}=await service.from("content_items").insert({content_type:"class_result",public_id:`TEST-IMAGE-EDIT-${suffix}`,created_by:active.id}).select("id").single();if(error)throw error;contentId=data.id;}
    {const{data,error}=await service.from("content_drafts").insert({content_id:contentId,data:{coverAssetId:null,galleryAssetIds:[]},validation_result:{valid:true,errors:[],warnings:[]},status:"validated",created_by:active.id,updated_by:active.id}).select("id").single();if(error)throw error;draftId=data.id;}
    const rows=[
      {id:ids.cover,role:"cover",name:"cover.png",sha:"1".repeat(64),alt:"封面",portrait:true,rights:"authorized",original:null,transformation:null},
      {id:ids.gallery,role:"gallery",name:"gallery.png",sha:"2".repeat(64),alt:"相簿一",portrait:false,rights:"owned",original:null,transformation:null},
      {id:ids.galleryTwo,role:"gallery",name:"gallery-two.png",sha:"3".repeat(64),alt:"相簿二",portrait:null,rights:"unknown",original:null,transformation:null},
      {id:ids.coverEdited,role:"cover",name:"cover.png",sha:"4".repeat(64),alt:"封面",portrait:true,rights:"authorized",original:ids.cover,transformation:transform},
      {id:ids.galleryEdited,role:"gallery",name:"gallery.png",sha:"5".repeat(64),alt:"相簿一",portrait:false,rights:"owned",original:ids.gallery,transformation:{...transform,rotation:0,crop:{x:.1,y:.1,width:.8,height:.8,aspectRatio:"1:1"}}},
    ];
    for(const row of rows){const path=`${active.id}/${contentId}/${row.id}/${row.id}.png`;objects.push(path);assert.equal((await service.storage.from("cms-drafts").upload(path,png(),{contentType:"image/png"})).error,null);const{error}=await service.from("media_assets").insert({id:row.id,content_id:contentId,draft_id:draftId,source:"cms_draft",role:row.role,sort_order:0,bucket:"cms-drafts",object_path:path,original_filename:row.name,mime_type:"image/png",extension:"png",byte_size:24,width:640,height:480,sha256:row.sha,alt_text:row.alt,rights_status:row.rights,contains_portrait:row.portrait,portrait_consent:row.portrait===true?"pending":"not_applicable",upload_status:"ready",created_by:active.id,original_media_id:row.original,transformation:row.transformation});if(error)throw error;}
    const initial=await service.from("content_drafts").update({data:{coverAssetId:ids.cover,galleryAssetIds:[ids.gallery,ids.galleryTwo]}}).eq("id",draftId).select("revision").single();assert.equal(initial.error,null);const start=initial.data.revision;
    const cover=await active.client.rpc("attach_derived_draft_media",{p_draft_id:draftId,p_current_media_id:ids.cover,p_derived_media_id:ids.coverEdited});assert.equal(cover.error,null);assert.equal(cover.data.revision,start+1);assert.equal(cover.data.status,"draft");assert.equal(cover.data.validation_result.valid,false);assert.equal(cover.data.data.coverAssetId,ids.coverEdited);
    const gallery=await active.client.rpc("attach_derived_draft_media",{p_draft_id:draftId,p_current_media_id:ids.gallery,p_derived_media_id:ids.galleryEdited});assert.equal(gallery.error,null);assert.equal(gallery.data.revision,start+2);assert.deepEqual(gallery.data.data.galleryAssetIds,[ids.galleryEdited,ids.galleryTwo]);
    assert.ok((await active.client.rpc("delete_unreferenced_draft_media",{p_media_id:ids.cover})).error,"root with child must not delete");assert.ok((await active.client.rpc("delete_unreferenced_draft_media",{p_media_id:ids.coverEdited})).error,"referenced derived must not delete");
    for(const blocked of [client(url,key),inactive.client,nonAdmin.client])assert.ok((await blocked.rpc("restore_original_draft_media",{p_draft_id:draftId,p_current_media_id:ids.coverEdited})).error);
    const restoredCover=await active.client.rpc("restore_original_draft_media",{p_draft_id:draftId,p_current_media_id:ids.coverEdited});assert.equal(restoredCover.error,null);assert.equal(restoredCover.data.revision,start+3);assert.equal(restoredCover.data.data.coverAssetId,ids.cover);assert.equal((await active.client.rpc("delete_unreferenced_draft_media",{p_media_id:ids.coverEdited})).data,true);
    const restoredGallery=await active.client.rpc("restore_original_draft_media",{p_draft_id:draftId,p_current_media_id:ids.galleryEdited});assert.equal(restoredGallery.error,null);assert.equal(restoredGallery.data.revision,start+4);assert.deepEqual(restoredGallery.data.data.galleryAssetIds,[ids.gallery,ids.galleryTwo]);assert.equal((await active.client.rpc("delete_unreferenced_draft_media",{p_media_id:ids.galleryEdited})).data,true);
    const originals=await service.from("media_assets").select("id,alt_text,contains_portrait,rights_status").in("id",[ids.cover,ids.gallery,ids.galleryTwo]);assert.equal(originals.error,null);assert.equal(originals.data.length,3);assert.equal((await service.from("media_assets").select("id",{count:"exact",head:true}).in("id",[ids.coverEdited,ids.galleryEdited])).count,0);
    assert.equal((await service.from("content_items").select("id",{count:"exact",head:true})).count,120);
  }finally{
    if(contentId)await service.from("content_items").delete().eq("id",contentId);if(objects.length)await service.storage.from("cms-drafts").remove(objects);if(users.length){await service.from("admin_users").delete().in("user_id",users);for(const id of users)await service.auth.admin.deleteUser(id);}
  }
  assert.equal((await service.from("content_items").select("id",{count:"exact",head:true})).count,119);assert.equal((await service.from("content_drafts").select("id",{count:"exact",head:true})).count,0);assert.equal((await service.from("media_assets").select("id",{count:"exact",head:true})).count,714);
});
