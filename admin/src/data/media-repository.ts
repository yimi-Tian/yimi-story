import type { SupabaseClient } from "@supabase/supabase-js";
import { safeStoragePath, validateMediaFile, type PortraitStatus, type RightsStatus } from "../media/media-validation";

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
    checksumSha256:row.sha256?String(row.sha256):null,altText:String(row.alt_text??""),containsPortrait:row.contains_portrait===true?"yes":row.contains_portrait===false?"no":"unknown",
    rightsStatus:["owned","authorized"].includes(String(row.rights_status))?String(row.rights_status) as RightsStatus:"unknown",previewUrl:null,
  };
}
const MEDIA_SELECT="id,content_id,draft_id,source,role,legacy_path,legacy_asset_key,bucket,object_path,original_filename,mime_type,byte_size,width,height,sha256,alt_text,contains_portrait,rights_status";
const fail=(code:string):never=>{throw new Error(code);};

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

export async function uploadDraftMedia(client:SupabaseClient,input:{file:File;contentId:string;draftId:string;role:MediaRole;existing:DraftMediaAsset[]}):Promise<{asset:DraftMediaAsset;warnings:string[]}>{
  const verified=await validateMediaFile(input.file);
  if(input.existing.some((a)=>a.source==="cms_draft"&&a.checksumSha256===verified.checksumSha256))fail("MEDIA_DUPLICATE");
  const {data:auth,error:authError}=await client.auth.getUser(); const user=auth.user;
  if(authError||!user)return fail("AUTH_REQUIRED");
  const mediaId=crypto.randomUUID(); const objectPath=safeStoragePath(user.id,input.contentId,mediaId,verified.extension);
  const {error:uploadError}=await client.storage.from("cms-drafts").upload(objectPath,input.file,{contentType:verified.mimeType,upsert:false});
  if(uploadError)fail("MEDIA_UPLOAD_FAILED");
  const {data,error}=await client.functions.invoke("validate-media-upload",{body:{contentId:input.contentId,draftId:input.draftId,mediaId,bucket:"cms-drafts",objectPath,role:input.role,originalFilename:input.file.name,declaredMimeType:verified.mimeType}});
  if(error||!data?.media){await client.storage.from("cms-drafts").remove([objectPath]);fail(data?.error==="duplicate_media"?"MEDIA_DUPLICATE":"MEDIA_SERVER_VALIDATION_FAILED");}
  const asset=map(data.media as Raw); asset.previewUrl=await createSignedPreviewUrl(client,asset);
  return {asset,warnings:verified.warnings};
}

export async function removeDraftMedia(client:SupabaseClient,asset:DraftMediaAsset):Promise<void>{
  const objectPath=asset.objectPath;
  if(asset.source!=="cms_draft"||!objectPath)return fail("MEDIA_DELETE_FORBIDDEN");
  const {error:storageError}=await client.storage.from("cms-drafts").remove([objectPath]); if(storageError)fail("MEDIA_STORAGE_DELETE_FAILED");
  const {data,error}=await client.rpc("delete_unreferenced_draft_media",{p_media_id:asset.id}); if(error||data!==true)fail("MEDIA_RECORD_DELETE_FAILED");
}

export async function cleanupDraftMedia(client:SupabaseClient,assets:DraftMediaAsset[]):Promise<void>{
  for(const asset of assets){try{await removeDraftMedia(client,asset);}catch{/* maintenance cleanup is best effort and safe to retry */}}
}
