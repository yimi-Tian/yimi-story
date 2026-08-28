import type { SupabaseClient } from "@supabase/supabase-js";
import { safeStoragePath, validateMediaFile, type PortraitStatus, type RightsStatus } from "../media/media-validation";
import { resolveOriginalMediaId, type TransformationMetadata } from "../media/image-editing";

export type MediaSource = "github_legacy" | "cms_draft" | "cms_public" | "supabase_upload";
export type MediaRole = "cover" | "gallery";
export interface DraftMediaAsset {
  id: string;
  referenceId: string;
  contentId: string;
  draftId: string | null;
  source: MediaSource;
  role: MediaRole;
  legacyPath: string | null;
  bucket: string | null;
  objectPath: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  checksumSha256: string | null;
  uploadStatus?: string;
  originalMediaId: string | null;
  transformation: TransformationMetadata | null;
  altText: string;
  containsPortrait: PortraitStatus;
  rightsStatus: RightsStatus;
  previewUrl: string | null;
}
export interface MediaMetadataUpdate { id: string; altText: string; containsPortrait: PortraitStatus; rightsStatus: RightsStatus }

type Raw = Record<string, unknown>;
function map(row: Raw): DraftMediaAsset {
  const source=row.source as MediaSource;
  return {
    id:String(row.id), referenceId:source==="github_legacy"?String(row.legacy_asset_key):String(row.id),
    contentId:String(row.content_id), draftId:row.draft_id?String(row.draft_id):null, source, role:row.role as MediaRole,
    legacyPath:row.legacy_path?String(row.legacy_path):null,bucket:row.bucket?String(row.bucket):null,objectPath:row.object_path?String(row.object_path):null,
    originalFilename:String(row.original_filename),mimeType:String(row.mime_type),byteSize:Number(row.byte_size),width:row.width==null?null:Number(row.width),height:row.height==null?null:Number(row.height),
    checksumSha256:row.sha256?String(row.sha256):null,uploadStatus:String(row.upload_status??""),originalMediaId:row.original_media_id?String(row.original_media_id):null,
    transformation:row.transformation&&typeof row.transformation==="object"?row.transformation as unknown as TransformationMetadata:null,
    altText:String(row.alt_text??""),containsPortrait:row.contains_portrait===true?"yes":row.contains_portrait===false?"no":"unknown",
    rightsStatus:["owned","authorized"].includes(String(row.rights_status))?String(row.rights_status) as RightsStatus:"unknown",previewUrl:null,
  };
}
const MEDIA_SELECT="id,content_id,draft_id,source,role,legacy_path,legacy_asset_key,bucket,object_path,original_filename,mime_type,byte_size,width,height,sha256,upload_status,alt_text,contains_portrait,rights_status,original_media_id,transformation";
function safeFailureSuffix(cause:unknown):string {
  if(!cause||typeof cause!=="object")return "";
  const row=cause as {code?:unknown;status?:unknown;statusCode?:unknown;context?:unknown};
  const response=row.context instanceof Response?row.context:null;
  const rawStatus=response?.status??row.status??row.statusCode;
  const status=Number(rawStatus),rawCode=typeof row.code==="string"?row.code:"";
  const code=rawCode.replace(/[^A-Za-z0-9_-]/g,"_").slice(0,48).toUpperCase();
  return[Number.isInteger(status)&&status>=100&&status<=599?`HTTP_${status}`:"",code?`CODE_${code}`:""].filter(Boolean).join("__");
}
const fail=(code:string,cause?:unknown):never=>{const suffix=safeFailureSuffix(cause);throw new Error(suffix?`${code}__${suffix}`:code);};

export async function getMediaForContent(client:SupabaseClient,contentId:string):Promise<DraftMediaAsset[]>{
  const {data,error}=await client.from("media_assets").select(MEDIA_SELECT).eq("content_id",contentId).is("deleted_at",null).order("sort_order");
  if(error)fail("MEDIA_LIST_FAILED");
  return Promise.all(((data??[]) as Raw[]).map(async(row)=>{
    const asset=map(row);
    if(asset.source==="github_legacy"&&asset.legacyPath){const clean=asset.legacyPath.replace(/^\/+/,"");const published=clean.startsWith("images/")?`public/${clean}`:clean;asset.previewUrl=new URL(published,"https://yimi-tian.github.io/yimi-story/").href;}
    else if(asset.source==="cms_draft"&&asset.objectPath){
      const {data:signed,error:signedError}=await client.storage.from("cms-drafts").createSignedUrl(asset.objectPath,900);
      if(!signedError)asset.previewUrl=signed.signedUrl;
    }
    return asset;
  }));
}

export async function createSignedPreviewUrl(client:SupabaseClient,asset:DraftMediaAsset):Promise<string>{
  if(asset.source==="github_legacy"&&asset.previewUrl)return asset.previewUrl;
  const objectPath=asset.objectPath;
  if(asset.source!=="cms_draft"||!objectPath)return fail("MEDIA_PREVIEW_UNAVAILABLE");
  const {data,error}=await client.storage.from("cms-drafts").createSignedUrl(objectPath,900);
  if(error||!data)return fail("MEDIA_PREVIEW_FAILED"); return data.signedUrl;
}

type SavedDraft={revision:number;status:"draft";updatedAt:string};
const savedDraft=(value:unknown):SavedDraft=>{const row=Array.isArray(value)?value[0]:value as Raw|undefined;if(!row)fail("DRAFT_MEDIA_ATTACH_FAILED");return{revision:Number(row.revision),status:"draft",updatedAt:String(row.updated_at)};};

async function attachExistingDraftMedia(client:SupabaseClient,draftId:string,asset:DraftMediaAsset):Promise<SavedDraft>{
  const attached=await client.rpc("attach_existing_draft_media",{p_draft_id:draftId,p_media_id:asset.id});
  if(attached.error)fail("DRAFT_MEDIA_ATTACH_FAILED",attached.error);
  return savedDraft(attached.data);
}

export async function uploadDraftMedia(client:SupabaseClient,input:{file:File;contentId:string;draftId:string;role:MediaRole;existing:DraftMediaAsset[];coverAssetId:string|null;galleryAssetIds:string[]}):Promise<{asset:DraftMediaAsset;draft:SavedDraft;warnings:string[];reattached:boolean}>{
  const verified=await validateMediaFile(input.file);
  const duplicate=input.existing.find((asset)=>asset.source==="cms_draft"&&asset.contentId===input.contentId&&asset.draftId===input.draftId&&asset.checksumSha256===verified.checksumSha256);
  if(duplicate){
    if(duplicate.referenceId===input.coverAssetId||input.galleryAssetIds.includes(duplicate.referenceId))fail("MEDIA_ALREADY_ATTACHED");
    if(duplicate.originalMediaId||duplicate.transformation)fail("MEDIA_DUPLICATE_VERSION_CONFLICT");
    if(duplicate.role!==input.role)fail("MEDIA_DUPLICATE_ROLE_CONFLICT");
    if(duplicate.uploadStatus&&duplicate.uploadStatus!=="ready")fail("MEDIA_DUPLICATE_NOT_READY");
    return{asset:duplicate,draft:await attachExistingDraftMedia(client,input.draftId,duplicate),warnings:verified.warnings,reattached:true};
  }
  const {data:auth,error:authError}=await client.auth.getUser(); const user=auth.user;
  if(authError||!user)return fail("AUTH_REQUIRED");
  const mediaId=crypto.randomUUID(); const objectPath=safeStoragePath(user.id,input.contentId,mediaId,verified.extension);
  const {error:uploadError}=await client.storage.from("cms-drafts").upload(objectPath,input.file,{contentType:verified.mimeType,upsert:false});
  if(uploadError)fail("MEDIA_UPLOAD_FAILED",uploadError);
  const {data,error}=await client.functions.invoke("validate-media-upload",{body:{contentId:input.contentId,draftId:input.draftId,mediaId,bucket:"cms-drafts",objectPath,role:input.role,originalFilename:input.file.name,declaredMimeType:verified.mimeType}});
  if(error||!data?.media){await client.storage.from("cms-drafts").remove([objectPath]);fail(data?.error==="duplicate_media"?"MEDIA_DUPLICATE":"MEDIA_SERVER_VALIDATION_FAILED",error??{code:typeof data?.error==="string"?`EDGE_${data.error}`:""});}
  const asset=map(data.media as Raw); asset.previewUrl=await createSignedPreviewUrl(client,asset);
  let draft:SavedDraft;
  try{draft=await attachExistingDraftMedia(client,input.draftId,asset);}
  catch(error){try{await removeDraftMedia(client,asset);}catch{/* exact cleanup is safe to retry */}throw error;}
  return {asset,draft,warnings:verified.warnings,reattached:false};
}

export async function createDerivedMediaVersion(client:SupabaseClient,input:{file:File;source:DraftMediaAsset;transformation:TransformationMetadata;contentId:string;draftId:string;existing:DraftMediaAsset[]}):Promise<{asset:DraftMediaAsset;draft:SavedDraft;warnings:string[]}>{
  if(input.source.source!=="cms_draft")fail("LEGACY_MEDIA_EDIT_FORBIDDEN");
  const verified=await validateMediaFile(input.file);
  if(input.existing.some((asset)=>asset.source==="cms_draft"&&asset.checksumSha256===verified.checksumSha256))fail("MEDIA_DUPLICATE");
  const {data:auth,error:authError}=await client.auth.getUser();const userId=auth.user?.id;if(authError||!userId)fail("AUTH_REQUIRED");
  const mediaId=crypto.randomUUID(),objectPath=safeStoragePath(userId!,input.contentId,mediaId,verified.extension);
  const {error:uploadError}=await client.storage.from("cms-drafts").upload(objectPath,input.file,{contentType:verified.mimeType,upsert:false});if(uploadError)fail("MEDIA_UPLOAD_FAILED",uploadError);
  let asset:DraftMediaAsset|null=null;
  let draft:SavedDraft|null=null;
  try{
    const {data,error}=await client.functions.invoke("validate-media-upload",{body:{contentId:input.contentId,draftId:input.draftId,mediaId,bucket:"cms-drafts",objectPath,role:input.source.role,originalFilename:input.source.originalFilename,declaredMimeType:verified.mimeType,originalMediaId:resolveOriginalMediaId(input.source),transformation:input.transformation}});
    if(error||!data?.media)fail(data?.error==="duplicate_media"?"MEDIA_DUPLICATE":"MEDIA_SERVER_VALIDATION_FAILED",error??{code:typeof data?.error==="string"?`EDGE_${data.error}`:""});
    asset=map(data.media as Raw);asset.previewUrl=await createSignedPreviewUrl(client,asset);
    const attached=await client.rpc("attach_derived_draft_media",{p_draft_id:input.draftId,p_current_media_id:input.source.id,p_derived_media_id:asset.id});
    if(attached.error)fail("DRAFT_MEDIA_ATTACH_FAILED",attached.error);
    draft=savedDraft(attached.data);
  }catch(error){
    if(asset){try{await removeDraftMedia(client,asset);}catch{/* cleanup remains safe to retry */}}
    else await client.storage.from("cms-drafts").remove([objectPath]);
    throw error;
  }
  if(input.source.originalMediaId){try{await removeDraftMedia(client,input.source);}catch{/* attached version is valid; orphan cleanup is safe to retry */}}
  return{asset:asset!,draft:draft!,warnings:verified.warnings};
}

export async function restoreOriginalMedia(client:SupabaseClient,input:{asset:DraftMediaAsset;draftId:string;allAssets:DraftMediaAsset[]}):Promise<{original:DraftMediaAsset;draft:SavedDraft}>{
  if(input.asset.source!=="cms_draft"||!input.asset.originalMediaId)fail("MEDIA_RESTORE_FORBIDDEN");
  const original=input.allAssets.find((asset)=>asset.id===input.asset.originalMediaId&&asset.source==="cms_draft"&&!asset.originalMediaId);
  if(!original)fail("MEDIA_ORIGINAL_NOT_FOUND");
  const restored=await client.rpc("restore_original_draft_media",{p_draft_id:input.draftId,p_current_media_id:input.asset.id});
  if(restored.error)fail("MEDIA_RESTORE_FAILED");
  await removeDraftMedia(client,input.asset);
  return{original:original!,draft:savedDraft(restored.data)};
}

export async function removeDraftMedia(client:SupabaseClient,asset:DraftMediaAsset):Promise<void>{
  const objectPath=asset.objectPath;
  if(asset.source!=="cms_draft"||!objectPath)return fail("MEDIA_DELETE_FORBIDDEN");
  const {data,error}=await client.rpc("delete_unreferenced_draft_media",{p_media_id:asset.id}); if(error||data!==true)fail("MEDIA_RECORD_DELETE_FAILED");
  const {error:storageError}=await client.storage.from("cms-drafts").remove([objectPath]); if(storageError)fail("MEDIA_STORAGE_DELETE_FAILED");
}

export async function cleanupDraftMedia(client:SupabaseClient,assets:DraftMediaAsset[]):Promise<void>{
  const ordered=[...assets].sort((a,b)=>Number(Boolean(b.originalMediaId))-Number(Boolean(a.originalMediaId)));
  for(const asset of ordered){try{await removeDraftMedia(client,asset);}catch{/* maintenance cleanup is best effort and safe to retry */}}
}
