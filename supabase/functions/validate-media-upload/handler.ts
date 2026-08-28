import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
type Admin = { status: "active" | "inactive" | "not_admin" | "invalid"; userId?: string };
type Crop = { x: number; y: number; width: number; height: number; aspectRatio: "original" | "free" | "4:3" | "3:4" | "16:9" | "1:1" };
type Transformation = { rotation: 0 | 90 | 180 | 270; crop: Crop; normalizedOrientation: true; originalOrientation: number };
type Input = { contentId: string; draftId: string; mediaId: string; bucket: string; objectPath: string; role: "cover" | "gallery"; originalFilename: string; declaredMimeType: string; originalMediaId?: string; transformation?: Transformation };
type Verified = { mimeType: string; extension: string; byteSize: number; width: number; height: number; sha256: string };
type Dependencies = {
  verify(token: string): Promise<Admin>;
  download(path: string): Promise<Uint8Array>;
  create(input: Input, verified: Verified, userId: string): Promise<Record<string, unknown>>;
  remove(path: string): Promise<void>;
};

const decoder = new TextDecoder();
function bearer(request: Request): string | null { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null; }
function detect(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 12 && decoder.decode(bytes.slice(0,4)) === "RIFF" && decoder.decode(bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
function dimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || decoder.decode(bytes.slice(12,16)) !== "IHDR") return null;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (mime === "image/jpeg") {
    let o=2; while(o+9<bytes.length){ if(bytes[o]!==255){o++;continue;} const m=bytes[o+1]; if(m===216||m===217){o+=2;continue;} const l=bytes[o+2]<<8|bytes[o+3]; if(l<2||o+l+2>bytes.length)return null; if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)) return {height:bytes[o+5]<<8|bytes[o+6],width:bytes[o+7]<<8|bytes[o+8]}; o+=l+2;} return null;
  }
  if(bytes.length<30)return null; const chunk=decoder.decode(bytes.slice(12,16));
  if(chunk==="VP8X")return{width:(bytes[24]|bytes[25]<<8|bytes[26]<<16)+1,height:(bytes[27]|bytes[28]<<8|bytes[29]<<16)+1};
  if(chunk==="VP8 ")return{width:(bytes[26]|bytes[27]<<8)&16383,height:(bytes[28]|bytes[29]<<8)&16383};
  if(chunk==="VP8L"&&bytes[20]===47){const b=bytes[21]|bytes[22]<<8|bytes[23]<<16|bytes[24]<<24;return{width:(b&16383)+1,height:((b>>>14)&16383)+1};}
  return null;
}
async function checksum(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest=await crypto.subtle.digest("SHA-256",source); return Array.from(new Uint8Array(digest),(b)=>b.toString(16).padStart(2,"0")).join("");
}
function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validTransformation(value: unknown): value is Transformation {
  if (!value || typeof value !== "object") return false;
  const item=value as Record<string,unknown>,crop=item.crop as Record<string,unknown>|undefined;
  const finite=(number:unknown)=>typeof number==="number"&&Number.isFinite(number);
  return [0,90,180,270].includes(Number(item.rotation))
    && item.normalizedOrientation===true
    && Number.isInteger(item.originalOrientation)&&Number(item.originalOrientation)>=1&&Number(item.originalOrientation)<=8
    && Boolean(crop)&&["original","free","4:3","3:4","16:9","1:1"].includes(String(crop?.aspectRatio))
    && [crop?.x,crop?.y,crop?.width,crop?.height].every(finite)
    && Number(crop?.x)>=0&&Number(crop?.y)>=0&&Number(crop?.width)>0&&Number(crop?.height)>0
    && Number(crop?.x)+Number(crop?.width)<=1.000001&&Number(crop?.y)+Number(crop?.height)<=1.000001;
}

export function createValidateMediaUploadHandler(allowedOrigin: string, deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers=corsHeaders(request,allowedOrigin,["POST","OPTIONS"]);
    if(!isAllowedOrigin(request,allowedOrigin))return jsonResponse({error:"origin_not_allowed"},403,headers);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(request.method!=="POST")return jsonResponse({error:"method_not_allowed"},405,headers);
    const token=bearer(request); if(!token)return jsonResponse({error:"authentication_required"},401,headers);
    const admin=await deps.verify(token); if(admin.status==="invalid")return jsonResponse({error:"invalid_token"},401,headers);
    if(admin.status!=="active"||!admin.userId)return jsonResponse({error:"admin_required"},403,headers);
    let input: Input; try{input=await request.json();}catch{return jsonResponse({error:"invalid_request"},400,headers);}
    if(!input||typeof input!=="object"||!validUuid(input.contentId)||!validUuid(input.draftId)||!validUuid(input.mediaId)||input.bucket!=="cms-drafts"||!['cover','gallery'].includes(input.role)||typeof input.objectPath!=="string"||typeof input.originalFilename!=="string"||typeof input.declaredMimeType!=="string")return jsonResponse({error:"invalid_request"},400,headers);
    const derived=input.originalMediaId!==undefined||input.transformation!==undefined;
    if(derived&&(!validUuid(input.originalMediaId)||!validTransformation(input.transformation)))return jsonResponse({error:"invalid_transformation"},400,headers);
    const expected=`${admin.userId}/${input.contentId}/${input.mediaId}/${input.mediaId}.`;
    if(!input.objectPath.startsWith(expected)||input.objectPath.includes("..")||input.objectPath.includes("\\"))return jsonResponse({error:"invalid_object_path"},403,headers);
    try {
      const bytes=await deps.download(input.objectPath);
      if(!bytes.length||bytes.length>MAX_BYTES)throw new Error(bytes.length>MAX_BYTES?"media_too_large":"media_corrupt");
      const mime=detect(bytes); if(!mime||!ALLOWED.has(mime)||mime!==input.declaredMimeType)throw new Error("media_header_mismatch");
      const size=dimensions(bytes,mime); if(!size?.width||!size.height||size.width>12000||size.height>12000)throw new Error("media_dimensions_invalid");
      const extension=mime==="image/jpeg"?"jpg":mime==="image/png"?"png":"webp";
      if(!input.objectPath.endsWith(`.${extension}`))throw new Error("media_extension_mismatch");
      const verified={mimeType:mime,extension,byteSize:bytes.length,width:size.width,height:size.height,sha256:await checksum(bytes)};
      const media=await deps.create(input,verified,admin.userId);
      return jsonResponse({media},200,headers);
    } catch(error) {
      await deps.remove(input.objectPath).catch(()=>undefined);
      const code=error instanceof Error&&/^(media_|duplicate_)/.test(error.message)?error.message:"media_validation_failed";
      return jsonResponse({error:code},code==="duplicate_media"?409:400,headers);
    }
  };
}
