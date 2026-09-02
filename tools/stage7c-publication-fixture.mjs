import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "../admin/node_modules/@supabase/supabase-js/dist/index.mjs";

const ORIGIN="https://yimi-story-admin.pages.dev";
const EXPECTED={items:119,classes:56,activities:63,snapshots:119,drafts:0,media:714,legacy:714,cmsDraft:0,cmsPublic:0,preparations:0,mappings:0,publications:0,draftObjects:0,publicObjects:0};
const LEGACY_DIGEST="395f49c6767d46b6b4a485dc6655cc673c4603938a70c78a6ac342d2554d08af";
const STATE=resolve("supabase/.temp/stage7c-fixture.json");
const command=process.argv[2];
const url=process.env.YIMI_CLOUD_SUPABASE_URL;
const publishableKey=process.env.YIMI_CLOUD_PUBLISHABLE_KEY;
const serviceKey=process.env.YIMI_CLOUD_SERVICE_ROLE_KEY;
const projectRef=process.env.SUPABASE_PROJECT_REF;
assert.ok([url,publishableKey,serviceKey,projectRef].every(Boolean),"Stage 7C Cloud env missing");
assert.equal(url,`https://${projectRef}.supabase.co`);
assert.equal(process.env.ALLOW_STAGE7C_PRODUCTION_FIXTURE,"true");
assert.equal(process.env.CONFIRM_STAGE7C_PRODUCTION_FIXTURE,projectRef);
const make=(key)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Origin:ORIGIN}}});
const service=make(serviceKey);
const exact=async(table,configure=(query)=>query)=>{const{count,error}=await configure(service.from(table).select("*",{count:"exact",head:true}));if(error)throw error;return count??0;};
const bucketCount=async(name)=>{const{data,error}=await service.storage.from(name).list("",{limit:1000});if(error)throw error;return data.length;};
async function baseline(){
  const{data,error}=await service.from("media_assets").select("id,content_id,source,role,sort_order,legacy_path,original_filename,mime_type,byte_size,width,height,sha256,alt_text,rights_status,contains_portrait,legacy_asset_key,published_snapshot_id").eq("source","github_legacy").order("id");if(error)throw error;
  return{items:await exact("content_items"),classes:await exact("content_items",q=>q.eq("content_type","class_result")),activities:await exact("content_items",q=>q.eq("content_type","activity")),snapshots:await exact("publication_snapshots"),drafts:await exact("content_drafts"),media:await exact("media_assets"),legacy:await exact("media_assets",q=>q.eq("source","github_legacy")),cmsDraft:await exact("media_assets",q=>q.eq("source","cms_draft")),cmsPublic:await exact("media_assets",q=>q.eq("source","cms_public")),preparations:await exact("publication_media_preparations"),mappings:await exact("publication_media_mappings"),publications:await exact("github_publications"),draftObjects:await bucketCount("cms-drafts"),publicObjects:await bucketCount("cms-public"),digest:createHash("sha256").update(JSON.stringify(data)).digest("hex")};
}
async function assertBaseline(){const value=await baseline();assert.deepEqual({...value,digest:undefined},{...EXPECTED,digest:undefined});assert.equal(value.digest,LEGACY_DIGEST);return value;}
async function identity(label){
  const password=`${randomBytes(24).toString("base64url")}Aa1!`,email=`stage7c-${label}-${randomUUID().slice(0,8)}@example.test`;
  const created=await service.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;
  const userId=created.data.user.id;const added=await service.from("admin_users").insert({user_id:userId,email,is_active:true});if(added.error)throw added.error;
  const client=make(publishableKey);const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;
  return{client,userId};
}
async function upload(client,userId,contentId,draftId,file,role,{originalMediaId=null,transformation=null}={}){
  const bytes=await readFile(file),mediaId=randomUUID(),extension=file.toLowerCase().endsWith(".png")?"png":"jpg",mime=extension==="png"?"image/png":"image/jpeg";
  const objectPath=`${userId}/${contentId}/${mediaId}/${mediaId}.${extension}`;
  const stored=await client.storage.from("cms-drafts").upload(objectPath,bytes,{contentType:mime,upsert:false});if(stored.error)throw stored.error;
  const validated=await client.functions.invoke("validate-media-upload",{body:{contentId,draftId,mediaId,bucket:"cms-drafts",objectPath,role,originalFilename:file.split(/[\\/]/u).at(-1),declaredMimeType:mime,...(originalMediaId?{originalMediaId,transformation}: {})}});
  if(validated.error||!validated.data?.media)throw new Error(`media validation failed: ${validated.data?.error??"edge"}`);
  return{...validated.data.media,objectPath};
}
async function create(){
  await assertBaseline();
  const existing=await service.from("content_items").select("id").eq("content_type","class_result").eq("public_id","CR-115-057").maybeSingle();if(existing.error)throw existing.error;assert.equal(existing.data,null,"CR-115-057 already exists");
  const actor=await identity("fixture"),state={projectRef,userId:actor.userId,publicId:"CR-115-057",contentId:null,draftId:null,snapshotId:null,publicationId:null,mediaIds:[],draftObjects:[],publicObjects:[],prNumber:null,prUrl:null,branch:null,commitSha:null};
  try{
    const item=await service.from("content_items").insert({content_type:"class_result",public_id:state.publicId,created_by:actor.userId}).select("id,published_snapshot_id").single();if(item.error)throw item.error;assert.equal(item.data.published_snapshot_id,null);state.contentId=item.data.id;
    const initial={id:state.publicId,year:115,title:"Stage 7C Publication Draft PR 驗收測試",className:"Stage 7C 網站發布驗收",instructor:"邑米測試管理員",description:"此筆內容僅用於驗證正式資料輸出、GitHub Draft PR 與圖片公開路徑，絕對不會合併至正式網站。",districts:["朴子市"],venue:"邑米地方知識探索平台",tags:["發布驗收"],sdgs:["SDG 4"],displayOrder:57,internalNotes:"STAGE7C-INTERNAL-NEVER-PUBLISH",publicNotes:"Stage 7C temporary fixture",coverAssetId:null,galleryAssetIds:[]};
    const draft=await service.from("content_drafts").insert({content_id:state.contentId,data:initial,validation_result:{valid:false,errors:[],warnings:[]},status:"draft",created_by:actor.userId,updated_by:actor.userId}).select("id,revision").single();if(draft.error)throw draft.error;state.draftId=draft.data.id;
    const root=await upload(actor.client,actor.userId,state.contentId,state.draftId,"public/images/class-results/CR-115-001/01.jpg","cover");
    const transform={rotation:90,crop:{x:0,y:0,width:1,height:1,aspectRatio:"original"},normalizedOrientation:true,originalOrientation:1};
    const derived=await upload(actor.client,actor.userId,state.contentId,state.draftId,"public/images/class-results/CR-115-001/02.jpg","cover",{originalMediaId:root.id,transformation:transform});
    const gallery=await upload(actor.client,actor.userId,state.contentId,state.draftId,"public/images/class-results/CR-115-001/03.jpg","gallery");
    state.mediaIds=[root.id,derived.id,gallery.id];state.draftObjects=[root.objectPath,derived.objectPath,gallery.objectPath];
    const canonical={...initial,coverAssetId:derived.id,galleryAssetIds:[gallery.id]};
    const saved=await actor.client.rpc("save_content_draft_with_media",{p_draft_id:state.draftId,p_data:canonical,p_validation_result:{valid:true,errors:[],warnings:[]},p_status:"validated",p_media_metadata:[derived,gallery].map(media=>({id:media.id,altText:media.id===derived.id?"Stage 7C 驗收封面":"Stage 7C 驗收相簿",containsPortrait:"no",rightsStatus:"owned"}))});if(saved.error)throw saved.error;
    const revision=Number(saved.data.revision);
    const checked=await actor.client.functions.invoke("prepare-publication-snapshot",{body:{action:"validate",draftId:state.draftId,expectedRevision:revision}});if(checked.error||checked.data?.preparation?.errors?.length)throw new Error("Stage 7A validation failed");
    const snapshot=await actor.client.functions.invoke("prepare-publication-snapshot",{body:{action:"create",draftId:state.draftId,expectedRevision:revision}});if(snapshot.error||!snapshot.data?.snapshot)throw new Error("Stage 7A snapshot failed");state.snapshotId=snapshot.data.snapshot.id;state.snapshotRevision=snapshot.data.snapshot.source_revision;state.snapshotChecksum=snapshot.data.snapshot.checksum_sha256;
    const promoted=await actor.client.functions.invoke("prepare-publication-media",{body:{snapshotId:state.snapshotId}});if(promoted.error||promoted.data?.preparation?.status!=="ready")throw new Error("Stage 7B promotion failed");
    const publicRows=await service.from("media_assets").select("id,object_path,publication_source_media_id,sha256").eq("content_id",state.contentId).eq("source","cms_public");if(publicRows.error)throw publicRows.error;state.publicMediaIds=publicRows.data.map(row=>row.id);state.publicObjects=publicRows.data.map(row=>row.object_path);
    const dry=await actor.client.functions.invoke("prepare-github-publication",{body:{action:"dry_run",snapshotId:state.snapshotId}});if(dry.error||dry.data?.publication?.status!=="dry_run_ready")throw new Error(`Stage 7C dry run failed: ${dry.data?.error??"edge"}`);state.publicationId=dry.data.publication.id;state.branch=dry.data.publication.branch;state.beforeCounts=dry.data.publication.beforeCounts;state.afterCounts=dry.data.publication.afterCounts;state.changedFiles=dry.data.publication.changedFiles;
    const mainBefore=process.env.EXPECTED_GITHUB_MAIN_SHA;assert.match(mainBefore??"",/^[0-9a-f]{40}$/u);
    assert.equal(dry.data.publication.baseSha,mainBefore,"GitHub main changed before fixture PR");
    await writeFile(STATE,`${JSON.stringify(state,null,2)}\n`,{encoding:"utf8",flag:"wx"});
    console.log(JSON.stringify({publicId:state.publicId,snapshotRevision:state.snapshotRevision,snapshotChecksum:state.snapshotChecksum.slice(0,12),publicationId:state.publicationId,branch:state.branch,formalFiles:state.changedFiles,beforeCounts:state.beforeCounts,afterCounts:state.afterCounts,mediaCount:2,dryRun:true,githubWrite:false,mainUnchanged:true}));
  }catch(error){await writeFile(STATE,`${JSON.stringify(state,null,2)}\n`,{encoding:"utf8",flag:"w"});throw error;}
}
async function createPr(){
  const state=JSON.parse(await readFile(STATE,"utf8"));assert.equal(state.projectRef,projectRef);assert.equal(state.publicId,"CR-115-057");assert.equal(state.prNumber,null,"fixture PR already exists");
  const publication=await service.from("github_publications").select("id,snapshot_id,pr_state,base_sha").eq("id",state.publicationId).single();if(publication.error)throw publication.error;assert.equal(publication.data.snapshot_id,state.snapshotId);assert.equal(publication.data.pr_state,"dry_run_ready");assert.equal(publication.data.base_sha,process.env.EXPECTED_GITHUB_MAIN_SHA);
  const actor=await identity("create-pr");
  try{
    const created=await actor.client.functions.invoke("prepare-github-publication",{body:{action:"create_draft_pr",snapshotId:state.snapshotId}});
    if(created.error||created.data?.publication?.status!=="open"){
      let code=created.data?.error??"EDGE_INVOCATION_FAILED";
      try{const body=await created.error?.context?.clone?.().json();if(typeof body?.error==="string"&&/^[A-Z][A-Z0-9_]{2,80}$/u.test(body.error))code=body.error;}catch{}
      throw new Error(`Draft PR creation failed: ${code}`);
    }
    Object.assign(state,{prNumber:created.data.publication.prNumber,prUrl:created.data.publication.prUrl,commitSha:created.data.publication.commitSha});
    await writeFile(STATE,`${JSON.stringify(state,null,2)}\n`,"utf8");
    console.log(JSON.stringify({publicId:state.publicId,snapshotRevision:state.snapshotRevision,snapshotChecksum:state.snapshotChecksum.slice(0,12),publicationId:state.publicationId,branch:state.branch,commitSha:state.commitSha,prNumber:state.prNumber,prUrl:state.prUrl,formalFiles:state.changedFiles,beforeCounts:state.beforeCounts,afterCounts:state.afterCounts,mediaCount:2}));
  }finally{await service.from("admin_users").delete().eq("user_id",actor.userId);await service.auth.admin.deleteUser(actor.userId);}
}
async function cleanup(){
  const state=JSON.parse(await readFile(STATE,"utf8"));assert.equal(state.projectRef,projectRef);assert.equal(state.publicId,"CR-115-057");
  const item=await service.from("content_items").select("id,public_id,published_snapshot_id").eq("id",state.contentId).single();if(item.error)throw item.error;assert.equal(item.data.public_id,state.publicId);assert.equal(item.data.published_snapshot_id,null);
  const publication=await service.from("github_publications").select("id,snapshot_id,pr_number,head_branch,pr_state").eq("id",state.publicationId).single();if(publication.error)throw publication.error;assert.equal(publication.data.snapshot_id,state.snapshotId);assert.equal(publication.data.pr_number,state.prNumber);assert.equal(publication.data.head_branch,state.branch);assert.notEqual(publication.data.pr_state,"merged");
  const actor=await identity("cleanup");
  try{const cancelled=await actor.client.functions.invoke("prepare-github-publication",{body:{action:"cancel",snapshotId:state.snapshotId}});if(cancelled.error||cancelled.data?.publication?.status!=="cancelled")throw new Error("publication cancellation failed");}
  finally{await service.from("admin_users").delete().eq("user_id",actor.userId);await service.auth.admin.deleteUser(actor.userId);}
  await service.from("github_publications").delete().eq("id",state.publicationId);
  await service.from("publication_media_mappings").delete().eq("publication_snapshot_id",state.snapshotId);
  await service.from("publication_media_preparations").delete().eq("publication_snapshot_id",state.snapshotId);
  if(state.publicObjects.length)await service.storage.from("cms-public").remove(state.publicObjects);
  if(state.publicMediaIds.length)await service.from("media_assets").delete().in("id",state.publicMediaIds);
  await service.from("publication_snapshots").delete().eq("id",state.snapshotId);
  if(state.mediaIds.length)await service.from("media_assets").delete().in("id",state.mediaIds.filter(id=>id!==state.mediaIds[0]));
  if(state.mediaIds[0])await service.from("media_assets").delete().eq("id",state.mediaIds[0]);
  if(state.draftObjects.length)await service.storage.from("cms-drafts").remove(state.draftObjects);
  await service.from("content_drafts").delete().eq("id",state.draftId);
  await service.from("content_items").delete().eq("id",state.contentId);
  await service.from("admin_users").delete().eq("user_id",state.userId);await service.auth.admin.deleteUser(state.userId);
  await assertBaseline();await unlink(STATE);
  console.log(JSON.stringify({prClosed:true,branchDeleted:true,fixtureCleaned:true,baseline:true}));
}

if(command==="--prepare")await create();else if(command==="--create-pr")await createPr();else if(command==="--cleanup")await cleanup();else throw new Error("Use --prepare, --create-pr, or --cleanup");
