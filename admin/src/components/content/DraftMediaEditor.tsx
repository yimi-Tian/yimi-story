import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupDraftMedia, getMediaForContent, removeDraftMedia, uploadDraftMedia, type DraftMediaAsset, type MediaMetadataUpdate } from "../../data/media-repository";
import { MAX_NEW_GALLERY_IMAGES, reorderAssetIds, type PortraitStatus, type RightsStatus } from "../../media/media-validation";

export interface DraftMediaEditorHandle {
  metadata(): MediaMetadataUpdate[];
  warnings(): { field:string;code:string;message:string }[];
  afterSave(): Promise<void>;
  cleanupTemporary(): Promise<void>;
}
interface Props { client:SupabaseClient;contentId:string;draftId:string;coverAssetId:string|null;galleryAssetIds:string[];onReferences(cover:string|null,gallery:string[]):void;onDirty():void;onUploading(value:boolean):void }

const uploadMessage=(code:string)=>({MEDIA_TOO_LARGE:"單張圖片請勿超過10 MB",MEDIA_TYPE_UNSUPPORTED:"僅支援 JPEG、PNG、WebP",MEDIA_EXTENSION_MISMATCH:"副檔名與圖片格式不一致",MEDIA_HEADER_MISMATCH:"圖片內容與檔案格式不一致",MEDIA_CORRUPT:"圖片損壞或無法讀取",MEDIA_DUPLICATE:"這張圖片已經上傳過。"}[code]??"圖片上傳失敗，請再試一次。");

export const DraftMediaEditor=forwardRef<DraftMediaEditorHandle,Props>(function DraftMediaEditor({client,contentId,draftId,coverAssetId,galleryAssetIds,onReferences,onDirty,onUploading},ref){
  const [assets,setAssets]=useState<DraftMediaAsset[]>([]); const [loading,setLoading]=useState(true); const [messages,setMessages]=useState<string[]>([]);
  const [pendingDelete,setPendingDelete]=useState<DraftMediaAsset[]>([]); const [temporary,setTemporary]=useState<DraftMediaAsset[]>([]); const [uploading,setUploading]=useState(false);
  useEffect(()=>{let active=true;void getMediaForContent(client,contentId).then((items)=>{if(active){setAssets(items);setLoading(false);}}).catch(()=>{if(active){setMessages(["圖片資料暫時無法載入。"]);setLoading(false);}});return()=>{active=false;};},[client,contentId]);
  useEffect(()=>onUploading(uploading),[onUploading,uploading]);
  const byRef=(id:string|null)=>assets.find((a)=>a.referenceId===id);
  const cover=byRef(coverAssetId); const gallery=galleryAssetIds.map((id)=>byRef(id)).filter(Boolean) as DraftMediaAsset[];
  const activeDraftAssets=assets.filter((a)=>a.source==="cms_draft"&&!pendingDelete.some((p)=>p.id===a.id));
  useImperativeHandle(ref,()=>({
    metadata:()=>activeDraftAssets.map((a)=>({id:a.id,altText:a.altText,containsPortrait:a.containsPortrait,rightsStatus:a.rightsStatus})),
    warnings:()=>[cover,...gallery].filter(Boolean).flatMap((asset)=>{
      const a=asset as DraftMediaAsset; const issues=[];
      if(!a.altText.trim())issues.push({field:a.role==="cover"?"coverAssetId":"galleryAssetIds",code:"media.altMissing",message:`${a.originalFilename} 尚未填寫替代文字。`});
      if(a.rightsStatus==="unknown")issues.push({field:"media",code:"media.rightsUnknown",message:`${a.originalFilename} 的圖片權利尚未確認。`});
      if(a.containsPortrait==="unknown")issues.push({field:"media",code:"media.portraitUnknown",message:`${a.originalFilename} 是否含可辨識人物尚未確認。`});
      if((a.width??300)<300||(a.height??300)<300)issues.push({field:"media",code:"media.smallDimension",message:`${a.originalFilename} 任一邊低於 300px。`}); return issues;
    }),
    afterSave:async()=>{for(const asset of pendingDelete)await removeDraftMedia(client,asset);setAssets((current)=>current.filter((a)=>!pendingDelete.some((p)=>p.id===a.id)));setPendingDelete([]);setTemporary([]);},
    cleanupTemporary:async()=>{await cleanupDraftMedia(client,temporary);setAssets((current)=>current.filter((a)=>!temporary.some((t)=>t.id===a.id)));setTemporary([]);},
  }),[activeDraftAssets,client,cover,gallery,pendingDelete,temporary]);
  const update=(id:string,field:"altText"|"containsPortrait"|"rightsStatus",value:string)=>{setAssets((current)=>current.map((a)=>a.id===id?{...a,[field]:value}:a));onDirty();};
  const upload=async(file:File,role:"cover"|"gallery")=>{setUploading(true);setMessages((m)=>[...m,`${file.name}：上傳中…`]);try{
    const {asset,warnings}=await uploadDraftMedia(client,{file,contentId,draftId,role,existing:assets});setAssets((a)=>[...a,asset]);setTemporary((a)=>[...a,asset]);
    if(role==="cover"){if(cover?.source==="cms_draft")setPendingDelete((a)=>[...a,cover]);onReferences(asset.referenceId,galleryAssetIds);}else onReferences(coverAssetId,[...galleryAssetIds,asset.referenceId]);
    setMessages((m)=>[...m.filter((x)=>!x.startsWith(`${file.name}：上傳中`)),`${file.name}：已上傳`,...warnings]);onDirty();
  }catch(error){const code=error instanceof Error?error.message:"";setMessages((m)=>[...m.filter((x)=>!x.startsWith(`${file.name}：上傳中`)),`${file.name}：${uploadMessage(code)}`]);}finally{setUploading(false);}};
  const remove=(asset:DraftMediaAsset)=>{if(asset.source==="cms_draft"&&!window.confirm("確定要移除此草稿圖片嗎？"))return;
    if(asset.role==="cover"&&coverAssetId===asset.referenceId)onReferences(null,galleryAssetIds);else onReferences(coverAssetId,galleryAssetIds.filter((id)=>id!==asset.referenceId));
    if(asset.source==="cms_draft")setPendingDelete((current)=>current.some((a)=>a.id===asset.id)?current:[...current,asset]);onDirty();};
  const move=(index:number,direction:-1|1)=>{onReferences(coverAssetId,reorderAssetIds(galleryAssetIds,index,direction));onDirty();};
  const card=(asset:DraftMediaAsset,index?:number)=><article className="media-card" key={asset.id}>{asset.previewUrl?<img src={asset.previewUrl} alt={asset.altText||`圖片預覽：${asset.originalFilename}`} />:<div className="media-preview-missing">無法預覽</div>}<div className="media-card__fields"><div className="media-card__title"><strong>{asset.originalFilename}</strong><span className={`source-badge source-badge--${asset.source}`}>{asset.source==="github_legacy"?"既有公開圖片":"草稿圖片"}</span></div><label>替代文字<input value={asset.altText} disabled={asset.source==="github_legacy"} onChange={(e)=>update(asset.id,"altText",e.target.value)} /></label><div className="media-meta-grid"><label>人物<select value={asset.containsPortrait} disabled={asset.source==="github_legacy"} onChange={(e)=>update(asset.id,"containsPortrait",e.target.value as PortraitStatus)}><option value="unknown">尚未確認</option><option value="yes">有人物</option><option value="no">無人物</option></select></label><label>權利<select value={asset.rightsStatus} disabled={asset.source==="github_legacy"} onChange={(e)=>update(asset.id,"rightsStatus",e.target.value as RightsStatus)}><option value="unknown">尚未確認</option><option value="owned">社大自有／自行拍攝</option><option value="authorized">已取得授權</option></select></label></div><div className="media-actions">{index!==undefined&&<><button type="button" className="button button--ghost" disabled={index===0} aria-label={`將 ${asset.originalFilename} 上移`} onClick={()=>move(index,-1)}>上移</button><button type="button" className="button button--ghost" disabled={index===gallery.length-1} aria-label={`將 ${asset.originalFilename} 下移`} onClick={()=>move(index,1)}>下移</button></>}<button type="button" className="button button--ghost" onClick={()=>remove(asset)}>{asset.source==="github_legacy"?"從草稿移除":"移除草稿圖片"}</button></div></div></article>;
  if(loading)return <section className="form-section"><h2>圖片</h2><p>正在載入圖片…</p></section>;
  return <section className="form-section media-editor"><h2>圖片</h2><p className="muted">請確認您有權使用上傳圖片；若含可辨識人物，請確認使用同意。</p><div className="media-group"><div className="media-group__heading"><h3>封面圖片</h3><label className="button button--secondary">{cover?"替換封面":"上傳封面"}<input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e)=>{const file=e.target.files?.[0];if(file)void upload(file,"cover");e.target.value="";}} /></label></div>{cover?card(cover):<p className="media-empty">尚未設定封面。</p>}</div><div className="media-group"><div className="media-group__heading"><h3>其他圖片（新草稿圖最多 {MAX_NEW_GALLERY_IMAGES} 張）</h3><label className="button button--secondary">新增圖片<input className="visually-hidden" type="file" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={uploading||gallery.filter((a)=>a.source==="cms_draft").length>=MAX_NEW_GALLERY_IMAGES} onChange={(e)=>{const files=[...(e.target.files??[])];void(async()=>{for(const file of files)await upload(file,"gallery");})();e.target.value="";}} /></label></div><div className="media-gallery">{gallery.map((asset,index)=>card(asset,index))}</div>{!gallery.length&&<p className="media-empty">目前沒有相簿圖片。</p>}</div>{messages.length>0&&<div className="upload-status" role="status">{messages.slice(-6).map((m,i)=><p key={`${m}-${i}`}>{m}</p>)}</div>}</section>;
});
