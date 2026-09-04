import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupDraftMedia, createDerivedMediaVersion, getMediaForContent, removeDraftMedia, restoreOriginalMedia, uploadDraftMedia, type DraftMediaAsset, type MediaMetadataUpdate } from "../../data/media-repository";
import { MAX_NEW_GALLERY_IMAGES, type PortraitStatus, type RightsStatus } from "../../media/media-validation";
import type { TransformationMetadata } from "../../media/image-editing";
import { imageAltTextLabel, imageAltTextHelp, imageAltTextRequired } from "../../content/content-contracts";
import { ImageEditorModal } from "./ImageEditorModal";

export const MAX_BATCH_FILES = 10;
export const BATCH_UPLOAD_CONCURRENCY = 3;

export interface DraftMediaEditorHandle {
  metadata(): MediaMetadataUpdate[];
  warnings(): { field:string;code:string;message:string }[];
  afterSave(): Promise<void>;
  cleanupTemporary(): Promise<void>;
}
interface SavedVersion {revision:number;status:"draft";updatedAt:string}
interface Props { client:SupabaseClient;contentId:string;draftId:string;coverAssetId:string|null;galleryAssetIds:string[];onReferences(cover:string|null,gallery:string[]):void;onDirty():void;onUploading(value:boolean):void;onEditing(value:boolean):void;onVersionSaved(cover:string|null,gallery:string[],saved:SavedVersion):void }
type QueueStatus="queued"|"uploading"|"done"|"failed";
interface QueueItem {id:string;file:File;role:"cover"|"gallery";status:QueueStatus;message:string}

const uploadMessage=(code:string)=>({MEDIA_TOO_LARGE:"單張圖片請勿超過 10 MB",MEDIA_TYPE_UNSUPPORTED:"僅支援 JPEG、PNG、WebP",MEDIA_EXTENSION_MISMATCH:"副檔名與圖片格式不一致",MEDIA_HEADER_MISMATCH:"圖片內容與檔案格式不一致",MEDIA_CORRUPT:"圖片損壞或無法讀取",MEDIA_ALREADY_ATTACHED:"此圖片已經在此草稿中。",MEDIA_DUPLICATE_VERSION_CONFLICT:"相同圖片已有編輯版本，請從現有圖片繼續編輯。",MEDIA_DUPLICATE_ROLE_CONFLICT:"相同圖片已用於另一種圖片位置。",MEDIA_DUPLICATE_NOT_READY:"既有圖片尚未完成驗證，暫時無法恢復。",MEDIA_DUPLICATE:"此圖片已存在，未重複上傳。"}[code.split("__")[0]]??"圖片上傳失敗，請再試一次。");
const statusLabel:Record<QueueStatus,string>={queued:"等待中",uploading:"上傳中",done:"完成",failed:"失敗"};
const rightsLabel:Record<RightsStatus,string>={unknown:"尚未確認",owned:"社大自有／自行拍攝",authorized:"已取得使用權"};
const portraitLabel:Record<PortraitStatus,string>={unknown:"尚未確認",yes:"有可辨識人物",no:"無可辨識人物"};

export function batchCapacity(currentGalleryCount:number,hasCover:boolean):number{
  return Math.max(0,Math.min(MAX_BATCH_FILES,MAX_NEW_GALLERY_IMAGES-currentGalleryCount+(hasCover?0:1)));
}
export function reorderGallery(ids:string[],from:number,to:number):string[]{
  if(from===to||from<0||to<0||from>=ids.length||to>=ids.length)return[...ids];
  const next=[...ids], [item]=next.splice(from,1);next.splice(to,0,item);return next;
}

export const DraftMediaEditor=forwardRef<DraftMediaEditorHandle,Props>(function DraftMediaEditor({client,contentId,draftId,coverAssetId,galleryAssetIds,onReferences,onDirty,onUploading,onEditing,onVersionSaved},ref){
  const [assets,setAssets]=useState<DraftMediaAsset[]>([]);const assetsRef=useRef<DraftMediaAsset[]>([]);
  const coverRef=useRef(coverAssetId);const galleryRef=useRef(galleryAssetIds);
  const [loading,setLoading]=useState(true);const [messages,setMessages]=useState<string[]>([]);
  const [pendingDelete,setPendingDelete]=useState<DraftMediaAsset[]>([]);const [temporary,setTemporary]=useState<DraftMediaAsset[]>([]);
  const [uploading,setUploading]=useState(false);const[processing,setProcessing]=useState(false);const[editing,setEditing]=useState<DraftMediaAsset|null>(null);
  const [queue,setQueue]=useState<QueueItem[]>([]);const queueRef=useRef<QueueItem[]>([]);const [dragIndex,setDragIndex]=useState<number|null>(null);
  const [batchRights,setBatchRights]=useState<RightsStatus>("unknown");const [batchPortrait,setBatchPortrait]=useState<PortraitStatus>("unknown");
  const assignAssets=(next:DraftMediaAsset[]|((current:DraftMediaAsset[])=>DraftMediaAsset[]))=>setAssets((current)=>{const value=typeof next==="function"?next(current):next;assetsRef.current=value;return value;});
  const assignQueue=(next:QueueItem[]|((current:QueueItem[])=>QueueItem[]))=>setQueue((current)=>{const value=typeof next==="function"?next(current):next;queueRef.current=value;return value;});
  useEffect(()=>{coverRef.current=coverAssetId;galleryRef.current=galleryAssetIds;},[coverAssetId,galleryAssetIds]);
  useEffect(()=>{let active=true;void getMediaForContent(client,contentId).then((items)=>{if(active){assetsRef.current=items;setAssets(items);setLoading(false);}}).catch(()=>{if(active){setMessages(["圖片資料暫時無法載入。"]);setLoading(false);}});return()=>{active=false;};},[client,contentId]);
  useEffect(()=>onUploading(uploading||processing),[onUploading,processing,uploading]);
  const byRef=(id:string|null)=>assets.find((a)=>a.referenceId===id);
  const cover=byRef(coverAssetId);const gallery=galleryAssetIds.map((id)=>byRef(id)).filter(Boolean) as DraftMediaAsset[];
  const activeDraftAssets=assets.filter((a)=>a.source==="cms_draft"&&!pendingDelete.some((p)=>p.id===a.id));
  const currentDraftGalleryCount=gallery.filter((a)=>a.source==="cms_draft").length;
  const capacity=batchCapacity(currentDraftGalleryCount,Boolean(cover));
  useImperativeHandle(ref,()=>({
    metadata:()=>activeDraftAssets.map((a)=>({id:a.id,altText:a.altText,containsPortrait:a.containsPortrait,rightsStatus:a.rightsStatus})),
    warnings:()=>[...(cover?[{asset:cover,field:"coverAssetId"}]:[]),...gallery.map((asset,index)=>({asset,field:`galleryAssetIds.${index}`}))].flatMap(({asset:a,field})=>{
      const issues=[];
      if(!a.altText.trim())issues.push({field,code:"media.altMissing",message:imageAltTextRequired});
      if(a.rightsStatus==="unknown")issues.push({field,code:"media.rightsUnknown",message:"請確認圖片使用權。"});
      if(a.containsPortrait==="unknown")issues.push({field,code:"media.portraitUnknown",message:"請確認是否有可辨識人物。"});
      if((a.width??300)<300||(a.height??300)<300)issues.push({field,code:"media.smallDimension",message:"圖片任一邊低於 300px。"});return issues;
    }),
    afterSave:async()=>{for(const asset of pendingDelete)await removeDraftMedia(client,asset);assignAssets((current)=>current.filter((a)=>!pendingDelete.some((p)=>p.id===a.id)));setPendingDelete([]);setTemporary([]);},
    cleanupTemporary:async()=>{await cleanupDraftMedia(client,temporary);assignAssets((current)=>current.filter((a)=>!temporary.some((t)=>t.id===a.id)));setTemporary([]);},
  }),[activeDraftAssets,client,cover,gallery,pendingDelete,temporary]);
  const update=(id:string,field:"altText"|"containsPortrait"|"rightsStatus",value:string)=>{assignAssets((current)=>current.map((a)=>a.id===id?{...a,[field]:value}:a));onDirty();};
  const setReferences=(nextCover:string|null,nextGallery:string[])=>{coverRef.current=nextCover;galleryRef.current=nextGallery;onReferences(nextCover,nextGallery);};
  const uploadOne=async(item:QueueItem)=>{
    assignQueue((current)=>current.map((q)=>q.id===item.id?{...q,status:"uploading",message:"正在安全檢查並上傳"}:q));
    try{
      const result=await uploadDraftMedia(client,{file:item.file,contentId,draftId,role:item.role,existing:assetsRef.current,coverAssetId:coverRef.current,galleryAssetIds:galleryRef.current});
      const {asset,warnings}=result;assignAssets((current)=>current.some((value)=>value.id===asset.id)?current:[...current,asset]);
      if(item.role==="cover"&&coverRef.current&&coverRef.current!==asset.referenceId){
        const previousCover=assetsRef.current.find((value)=>value.referenceId===coverRef.current);
        if(previousCover?.source==="cms_draft")setPendingDelete((current)=>current.some((value)=>value.id===previousCover.id)?current:[...current,previousCover]);
      }
      let nextCover=coverRef.current,nextGallery=[...galleryRef.current];if(item.role==="cover")nextCover=asset.referenceId;else if(!nextGallery.includes(asset.referenceId))nextGallery.push(asset.referenceId);
      setReferences(nextCover,nextGallery);onVersionSaved(nextCover,nextGallery,result.draft);
      assignQueue((current)=>current.map((q)=>q.id===item.id?{...q,status:"done",message:result.reattached?"已恢復既有圖片":"上傳完成"}:q));if(warnings.length)setMessages((current)=>[...current,...warnings]);
    }catch(error){const code=error instanceof Error?error.message:"";assignQueue((current)=>current.map((q)=>q.id===item.id?{...q,status:"failed",message:uploadMessage(code)}:q));}
  };
  const runQueue=async(ids?:string[])=>{const selected=queueRef.current.filter((item)=>(ids?ids.includes(item.id):item.status==="queued"||item.status==="failed"));if(!selected.length)return;setUploading(true);let cursor=0;const worker=async()=>{while(cursor<selected.length){const item=selected[cursor++];await uploadOne(item);}};try{await Promise.all(Array.from({length:Math.min(BATCH_UPLOAD_CONCURRENCY,selected.length)},worker));}finally{setUploading(false);}};
  const chooseFiles=(files:File[])=>{const pending=queueRef.current.filter((item)=>item.status!=="done");const accepted=files.slice(0,Math.max(0,capacity-pending.length));const omitted=files.length-accepted.length;const hasQueuedCover=pending.some((item)=>item.role==="cover");const items=accepted.map((file,index):QueueItem=>({id:crypto.randomUUID(),file,role:!coverRef.current&&!hasQueuedCover&&index===0?"cover":"gallery",status:"queued",message:"等待上傳"}));assignQueue([...pending,...items]);if(omitted>0)setMessages((current)=>[...current,`已達圖片容量，本次有 ${omitted} 張未加入。`]);};
  const setQueueCover=(id:string)=>assignQueue((current)=>current.map((item)=>item.status==="queued"?{...item,role:item.id===id?"cover":"gallery"}:item));
  const applyBatchMetadata=()=>{const used=new Set([...(coverAssetId?[coverAssetId]:[]),...galleryAssetIds]);assignAssets((current)=>current.map((asset)=>asset.source==="cms_draft"&&used.has(asset.referenceId)?{...asset,rightsStatus:batchRights,containsPortrait:batchPortrait}:asset));onDirty();setMessages((current)=>[...current,"已套用圖片使用權與人物狀態；圖片替代文字仍須逐張填寫。"]);};
  const remove=(asset:DraftMediaAsset)=>{if(asset.source==="cms_draft"&&!window.confirm("確定要移除此草稿圖片嗎？"))return;if(asset.role==="cover"&&coverAssetId===asset.referenceId)setReferences(null,galleryAssetIds);else setReferences(coverAssetId,galleryAssetIds.filter((id)=>id!==asset.referenceId));if(asset.source==="cms_draft")setPendingDelete((current)=>current.some((a)=>a.id===asset.id)?current:[...current,asset]);onDirty();};
  const setGalleryOrder=(next:string[])=>{setReferences(coverAssetId,next);onDirty();};const move=(index:number,direction:-1|1)=>setGalleryOrder(reorderGallery(galleryAssetIds,index,index+direction));
  const nextReferences=(asset:DraftMediaAsset,replacement:string)=>asset.role==="cover"?{cover:replacement,gallery:galleryAssetIds}:{cover:coverAssetId,gallery:galleryAssetIds.map((id)=>id===asset.referenceId?replacement:id)};
  const saveEdited=async(file:File,transformation:TransformationMetadata)=>{if(!editing)return;setProcessing(true);try{const result=await createDerivedMediaVersion(client,{file,source:editing,transformation,contentId,draftId,existing:assetsRef.current});const refs=nextReferences(editing,result.asset.referenceId);assignAssets((current)=>[...current.filter((asset)=>asset.id!==editing.id||!editing.originalMediaId),result.asset]);setReferences(refs.cover,refs.gallery);onVersionSaved(refs.cover,refs.gallery,result.draft);setMessages((current)=>[...current,`${editing.originalFilename}：已儲存編輯版本`,...result.warnings]);setEditing(null);onEditing(false);}catch(error){const code=error instanceof Error?error.message:"";setMessages((current)=>[...current,`${editing.originalFilename}：${uploadMessage(code)}`]);throw error;}finally{setProcessing(false);}};
  const restore=async(asset:DraftMediaAsset)=>{if(!asset.originalMediaId||!window.confirm("確定要恢復原始草稿圖片嗎？目前編輯版本將移除。"))return;setProcessing(true);try{const result=await restoreOriginalMedia(client,{asset,draftId,allAssets:assetsRef.current});const refs=nextReferences(asset,result.original.referenceId);assignAssets((current)=>current.filter((item)=>item.id!==asset.id));setReferences(refs.cover,refs.gallery);onVersionSaved(refs.cover,refs.gallery,result.draft);setMessages((current)=>[...current,`${asset.originalFilename}：已恢復原圖`]);}catch{setMessages((current)=>[...current,`${asset.originalFilename}：恢復原圖失敗，請再試一次。`]);}finally{setProcessing(false);}};
  const card=(asset:DraftMediaAsset,index?:number)=>{const label=index===undefined?"封面":`相簿 ${index+1}`;const editable=asset.source==="cms_draft";const altError=editable&&!asset.altText.trim();const rightsError=editable&&asset.rightsStatus==="unknown";const portraitError=editable&&asset.containsPortrait==="unknown";const fieldId=`media-${asset.id}`;return <article id={index===undefined?"media-cover":`media-gallery-${index+1}`} className="media-card" key={asset.id} draggable={index!==undefined&&!processing&&!uploading} onDragStart={()=>setDragIndex(index??null)} onDragOver={(event)=>{if(index!==undefined)event.preventDefault();}} onDrop={()=>{if(index!==undefined&&dragIndex!==null)setGalleryOrder(reorderGallery(galleryAssetIds,dragIndex,index));setDragIndex(null);}}>{asset.previewUrl?<img src={asset.previewUrl} alt={asset.altText||`圖片預覽：${asset.originalFilename}`} />:<div className="media-preview-missing">無法預覽</div>}<div className="media-card__fields"><div className="media-card__title"><strong>{label}</strong><span>{asset.originalFilename}</span><span className={`source-badge source-badge--${asset.source}`}>{asset.source==="github_legacy"?"既有公開圖片":"草稿圖片"}</span>{asset.originalMediaId&&<span className="source-badge source-badge--edited">已編輯</span>}</div><div className={altError?"field-invalid":undefined}><label htmlFor={`${fieldId}-alt`}>{imageAltTextLabel}</label><input id={`${fieldId}-alt`} value={asset.altText} disabled={asset.source==="github_legacy"} aria-invalid={altError} aria-describedby={`${fieldId}-alt-help${altError?` ${fieldId}-alt-error`:""}`} onChange={(event)=>update(asset.id,"altText",event.target.value)} /><small id={`${fieldId}-alt-help`}>{imageAltTextHelp}</small>{altError&&<small id={`${fieldId}-alt-error`} className="field-error">{imageAltTextRequired}</small>}</div><div className="media-meta-grid"><label className={portraitError?"field-invalid":undefined}>是否含可辨識人物<select aria-invalid={portraitError} aria-describedby={portraitError?`${fieldId}-portrait-error`:undefined} value={asset.containsPortrait} disabled={asset.source==="github_legacy"} onChange={(event)=>update(asset.id,"containsPortrait",event.target.value as PortraitStatus)}>{Object.entries(portraitLabel).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>{portraitError&&<small id={`${fieldId}-portrait-error`} className="field-error">請確認是否有可辨識人物。</small>}</label><label className={rightsError?"field-invalid":undefined}>圖片使用權<select aria-invalid={rightsError} aria-describedby={rightsError?`${fieldId}-rights-error`:undefined} value={asset.rightsStatus} disabled={asset.source==="github_legacy"} onChange={(event)=>update(asset.id,"rightsStatus",event.target.value as RightsStatus)}>{Object.entries(rightsLabel).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>{rightsError&&<small id={`${fieldId}-rights-error`} className="field-error">請確認圖片使用權。</small>}</label></div>{asset.containsPortrait==="yes"&&<p className="muted">請確認照片中的人物已同意公開使用。</p>}{asset.source==="github_legacy"&&<p className="muted">既有公開圖片目前不可直接編輯。</p>}<div className="media-actions">{index!==undefined&&<><button type="button" className="button button--ghost" disabled={index===0||processing} aria-label={`將相簿 ${index+1} 往前`} onClick={()=>move(index,-1)}>往前</button><button type="button" className="button button--ghost" disabled={index===gallery.length-1||processing} aria-label={`將相簿 ${index+1} 往後`} onClick={()=>move(index,1)}>往後</button></>}{asset.source==="cms_draft"&&<button type="button" className="button button--secondary" disabled={processing||uploading} onClick={()=>setEditing(asset)}>旋轉／裁切</button>}{asset.originalMediaId&&<button type="button" className="button button--ghost" disabled={processing||uploading} onClick={()=>void restore(asset)}>恢復原圖</button>}<button type="button" className="button button--ghost" disabled={processing||uploading} onClick={()=>remove(asset)}>移除</button></div></div></article>;};
  if(loading)return <section className="form-section"><h2>圖片</h2><p>正在載入圖片…</p></section>;
  const progress=queue.filter((item)=>item.status==="done"||item.status==="failed").length;
  return <section id="media-section" className="form-section media-editor"><h2>圖片</h2><p className="muted">單次最多上傳10張，相簿最多20張</p><p className="muted">支援 JPEG、PNG 或 WebP；同時處理最多3張。請確認圖片使用權與人物公開同意。</p>
    <div className="batch-upload"><div className="media-group__heading"><div><h3>批次上傳</h3><p className="muted">目前相簿已有 {currentDraftGalleryCount} 張，還可新增 {Math.max(0,MAX_NEW_GALLERY_IMAGES-currentDraftGalleryCount)} 張；本次可選 {capacity} 張。</p></div><label className="button button--secondary">選擇多張圖片<input data-testid="batch-media-input" className="visually-hidden" type="file" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={uploading||processing||capacity===0} onChange={(event)=>{chooseFiles([...(event.target.files??[])]);event.target.value="";}} /></label></div>
      {queue.length>0&&<><div className="upload-progress" role="status" aria-live="polite">{uploading?`上傳中 ${progress} / ${queue.length}`:`已處理 ${progress} / ${queue.length}`}</div><ul className="upload-queue">{queue.map((item)=><li key={item.id} className={`upload-queue__item upload-queue__item--${item.status}`}><span><strong>{item.file.name}</strong><small>{item.role==="cover"?"封面":"相簿"}・{statusLabel[item.status]}・{item.message}</small></span>{item.status==="queued"&&<button type="button" className="button button--ghost" onClick={()=>setQueueCover(item.id)}>{item.role==="cover"?"已設為封面":"設為封面"}</button>}{item.status==="failed"&&<button type="button" className="button button--secondary" disabled={uploading} onClick={()=>void runQueue([item.id])}>重新上傳</button>}</li>)}</ul><button type="button" className="button button--accent" disabled={uploading||!queue.some((item)=>item.status==="queued"||item.status==="failed")} onClick={()=>void runQueue()}>{uploading?"圖片上傳中…":"開始上傳"}</button></>}
    </div>
    <div className="batch-metadata"><h3>批次設定</h3><p className="muted">套用到目前草稿使用中的全部圖片；圖片替代文字仍須逐張填寫。</p><div className="media-meta-grid"><label>圖片使用權<select value={batchRights} onChange={(event)=>setBatchRights(event.target.value as RightsStatus)}>{Object.entries(rightsLabel).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label><label>是否含可辨識人物<select value={batchPortrait} onChange={(event)=>setBatchPortrait(event.target.value as PortraitStatus)}>{Object.entries(portraitLabel).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label></div><button type="button" className="button button--secondary" disabled={!activeDraftAssets.length} onClick={applyBatchMetadata}>套用到全部圖片</button><small>若選擇「有可辨識人物」，請先確認已取得公開同意。</small></div>
    <div className="media-group"><div className="media-group__heading"><h3>封面圖片</h3><label className="button button--secondary">{cover?"替換封面":"上傳封面"}<input className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={uploading||processing} onChange={(event)=>{const file=event.target.files?.[0];if(file){const item={id:crypto.randomUUID(),file,role:"cover" as const,status:"queued" as const,message:"等待上傳"};assignQueue((current)=>[...current.filter((value)=>value.status!=="done"),item]);window.setTimeout(()=>void runQueue([item.id]),0);}event.target.value="";}} /></label></div>{cover?card(cover):<p id="media-cover" className="media-empty">尚未設定封面。</p>}</div>
    <div className="media-group"><div className="media-group__heading"><h3>相簿圖片（最多 {MAX_NEW_GALLERY_IMAGES} 張新草稿圖）</h3><span className="muted">可拖曳排序，也可使用「往前／往後」。</span></div><div className="media-gallery">{gallery.map((asset,index)=>card(asset,index))}</div>{!gallery.length&&<p className="media-empty">目前沒有相簿圖片。</p>}</div>
    {messages.length>0&&<div className="upload-status" role="status">{messages.slice(-6).map((message,index)=><p key={`${message}-${index}`}>{message}</p>)}</div>}{editing&&<ImageEditorModal asset={editing} onCancel={()=>{setEditing(null);onEditing(false);}} onDirtyState={onEditing} onSave={saveEdited} />}
  </section>;
});
