import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import { DEFAULT_LOCAL_ADMIN_ORIGIN } from "../_shared/cors.ts";
import { createValidateMediaUploadHandler } from "./handler.ts";

const url=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin=Deno.env.get("ADMIN_ALLOWED_ORIGIN")??DEFAULT_LOCAL_ADMIN_ORIGIN;
const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(createValidateMediaUploadHandler(allowedOrigin,{
  async verify(token){
    const {data,error}=await service.auth.getUser(token); if(error||!data.user)return{status:"invalid"};
    const {data:admin,error:adminError}=await service.from("admin_users").select("is_active").eq("user_id",data.user.id).maybeSingle();
    if(adminError)throw new Error("admin_lookup_failed");
    return admin?{status:admin.is_active?"active":"inactive",userId:data.user.id}:{status:"not_admin"};
  },
  async download(path){const {data,error}=await service.storage.from("cms-drafts").download(path);if(error||!data)throw new Error("media_download_failed");return new Uint8Array(await data.arrayBuffer());},
  async create(input,verified,userId){
    const {data,error}=await service.from("media_assets").insert({
      id:input.mediaId,content_id:input.contentId,draft_id:input.draftId,source:"cms_draft",role:input.role,sort_order:0,
      bucket:"cms-drafts",object_path:input.objectPath,original_filename:String(input.originalFilename||"image").slice(0,255),
      mime_type:verified.mimeType,extension:verified.extension,byte_size:verified.byteSize,width:verified.width,height:verified.height,
      sha256:verified.sha256,alt_text:"",rights_status:"unknown",contains_portrait:null,portrait_consent:"pending",upload_status:"ready",created_by:userId,
    }).select("id,content_id,draft_id,source,role,bucket,object_path,original_filename,mime_type,byte_size,width,height,sha256,alt_text,contains_portrait,rights_status,created_at,updated_at").single();
    if(error?.code==="23505")throw new Error("duplicate_media"); if(error||!data)throw new Error("media_record_failed"); return data;
  },
  async remove(path){await service.storage.from("cms-drafts").remove([path]);},
}));
