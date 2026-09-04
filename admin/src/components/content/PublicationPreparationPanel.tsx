import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchPublicationMediaPreparation, fetchPublicationSnapshots, fetchPublicationTimeline, requestPublicationMediaPreparation,
  requestPublicationPreparation, type PublicationIssue, type PublicationMediaPreparation,
  type PublicationPreparation, type PublicationSnapshotSummary, type PublicationTimeline, type GitHubPublication,
} from "../../data/publication-repository";
import { presentValidationIssue } from "../../content/content-contracts";
import { GitHubPublicationPanel } from "./GitHubPublicationPanel";
import { publicationLabels, resolvePublicationUiState } from "../../content/publication-ui-state";

interface Props {client:SupabaseClient;contentId:string;draftId:string;revision:number;draftStatus:string;blocked:boolean}
type Working="check"|"prepare"|null;

const messageFor=(error:unknown)=>{
  const code=error instanceof Error?error.message:"";
  if(code==="PUBLICATION_STALE_REVISION")return"草稿版本已變更，請重新整理後再準備發布。";
  if(code==="PUBLICATION_DRAFT_NOT_VALIDATED")return"內容已通過檢查，請先按「儲存草稿」，再準備發布。";
  if(code==="PUBLICATION_OLD_SCHEMA")return"此版本使用較舊的發布格式，請重新儲存草稿後建立新版發布資料。";
  if(code==="SOURCE_MEDIA_MISSING"||code==="SOURCE_OBJECT_MISSING")return"圖片資料尚未準備完成，請確認圖片仍可正常預覽。";
  if(code==="SOURCE_CHECKSUM_MISMATCH")return"圖片完整性檢查失敗，請重新確認圖片。";
  return"準備發布未完成，請確認內容、圖片與網路連線後再試。";
};
const stepState=(done:boolean,current:boolean,error=false)=>error?"需修正":done?"已完成":current?"進行中":"未完成";

export function PublicationPreparationPanel({client,contentId,draftId,revision,draftStatus,blocked}:Props){
  const[preparation,setPreparation]=useState<PublicationPreparation|null>(null);const[snapshots,setSnapshots]=useState<PublicationSnapshotSummary[]>([]);
  const[media,setMedia]=useState<PublicationMediaPreparation|null>(null);
  const[timeline,setTimeline]=useState<PublicationTimeline>({publishedSnapshot:null,entries:[]});
  const[loading,setLoading]=useState(true);const[loadedKey,setLoadedKey]=useState("");
  const[working,setWorking]=useState<Working>(null);const[error,setError]=useState("");
  const current=useMemo(()=>snapshots.find((snapshot)=>snapshot.revision===revision)??null,[revision,snapshots]);
  const readKey=`${contentId}:${revision}`;
  useEffect(()=>{let active=true;setLoading(true);setPreparation(null);setMedia(null);setError("");
    void Promise.all([fetchPublicationSnapshots(client,contentId),fetchPublicationTimeline(client,contentId)]).then(async([rows,history])=>{
      const candidate=rows.find((snapshot)=>snapshot.revision===revision)??history.entries.find(({snapshot})=>snapshot.revision===revision)?.snapshot??null;
      const value=candidate?await fetchPublicationMediaPreparation(client,candidate.id):null;
      if(active){setSnapshots(candidate&&!rows.some((row)=>row.id===candidate.id)?[candidate,...rows]:rows);setTimeline(history);setMedia(value);setLoadedKey(readKey);}
    }).catch(()=>{if(active)setError("無法讀取發布進度，請重新整理後再操作。");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};},[client,contentId,revision,readKey]);
  const ui=resolvePublicationUiState({timeline,currentSnapshot:current,revision,mediaPreparation:media});
  const unavailable=loading||loadedKey!==readKey;
  const publicationTarget=ui.active?.snapshot??current??ui.relevant?.snapshot??null;
  const targetPublication=timeline.entries.find(({snapshot})=>snapshot.id===publicationTarget?.id)?.publication??null;
  const publicationChanged=(publication:GitHubPublication)=>{
    if(!publicationTarget)return;
    setTimeline((history)=>({publishedSnapshot:publication.status==="finalized"?publicationTarget:history.publishedSnapshot,
      entries:[{publication,snapshot:publicationTarget},...history.entries.filter((row)=>row.publication.id!==publication.id)]}));
  };
  const check=async()=>{if(blocked||working)return;setWorking("check");setError("");try{const result=await requestPublicationPreparation(client,draftId,revision,"validate");setPreparation(result.preparation);}catch(caught){setError(messageFor(caught));}finally{setWorking(null);}};
  const prepare=async()=>{if(blocked||working||unavailable||!ui.canPrepare)return;setWorking("prepare");setError("");try{
    const checked=await requestPublicationPreparation(client,draftId,revision,"validate");setPreparation(checked.preparation);if(!checked.preparation.valid)return;
    if(draftStatus!=="validated")throw new Error("PUBLICATION_DRAFT_NOT_VALIDATED");
    let snapshot=current;if(snapshot&&snapshot.schemaVersion!=="1.1")throw new Error("PUBLICATION_OLD_SCHEMA");if(!snapshot){const created=await requestPublicationPreparation(client,draftId,revision,"create");snapshot=created.snapshot??null;if(!snapshot)throw new Error("PUBLICATION_SNAPSHOT_FAILED");setSnapshots((rows)=>[snapshot!,...rows.filter((row)=>row.id!==snapshot!.id)]);}
    const prepared=await requestPublicationMediaPreparation(client,snapshot.id);setMedia(prepared);
  }catch(caught){setError(messageFor(caught));}finally{setWorking(null);}};
  const hasIssues=Boolean(preparation&&!preparation.valid);const mediaReady=media?.status==="ready";
  const steps=[
    {label:"內容填寫",state:stepState(true,false)},{label:"檢查並修正",state:stepState(draftStatus==="validated"||Boolean(preparation?.valid),!preparation&&!current,hasIssues)},
    {label:"預覽確認",state:stepState(Boolean(current)||mediaReady,draftStatus==="validated"&&!current)},{label:"準備發布",state:stepState(mediaReady,Boolean(current)&&!mediaReady,media?.status==="failed")},
    {label:ui.status&&!ui.showAdminWaiting?"管理員確認":"等待管理員確認",state:ui.reviewComplete?"已完成":ui.showAdminWaiting?"等待確認":"未完成"},{label:"發布完成",state:ui.finalized?"已完成":"未完成"},
  ];
  const issues=(items:PublicationIssue[])=>items.map((item,index)=>{const issue=presentValidationIssue(item);return <li key={`${item.code}-${index}`}><button type="button" className="validation-link" onClick={()=>{const target=document.getElementById(issue.targetId);target?.scrollIntoView?.({behavior:"smooth",block:"center"});const input=target?.matches("input,select,textarea,button")?target:target?.querySelector<HTMLElement>("input,select,textarea,button");(input as HTMLElement|null)?.focus();}}><strong>{issue.field}</strong>：{issue.message}</button></li>;});
  return <section className="form-section publication-panel" aria-labelledby="publication-title">
    <div className="publication-panel__heading"><div><p className="eyebrow">發布進度</p><h2 id="publication-title">完成內容並送出發布</h2><p className="muted">依畫面步驟檢查內容與圖片；公開前仍須由管理員確認。</p></div><span className="record-status">{unavailable?"讀取發布進度中":ui.status?ui.primaryLabel:hasIssues?"需要修正":ui.primaryLabel}</span></div>
    {!unavailable&&<div className="publication-result" aria-live="polite">{ui.showPublishedVersion&&<strong>目前正式版本 r{timeline.publishedSnapshot!.revision}</strong>}<span>最新草稿 r{revision}</span>{ui.showUnpublishedChanges&&<span>有未發布變更</span>}{ui.secondaryMessage&&<span>{ui.secondaryMessage}</span>}</div>}
    <ol className="publication-stepper" aria-label="發布進度">{steps.map((step,index)=><li key={step.label} className={`publication-step publication-step--${step.state}`} aria-current={step.state==="進行中"?"step":undefined}><span>{index+1}</span><strong>{step.label}</strong><small>{step.state}</small></li>)}</ol>
    {blocked&&<div className="unsaved-notice"><strong>請先儲存目前修改</strong><span>儲存後才能準備或送出發布。</span></div>}{error&&<div className="form-error" role="alert">{error}</div>}
    {preparation&&<div className="validation-grid" aria-live="polite"><section className="validation-panel validation-panel--error"><h3>{preparation.errors.length?`需要修正 ${preparation.errors.length} 項`:"內容檢查完成"}</h3>{preparation.errors.length?<ul>{issues(preparation.errors)}</ul>:<p>沒有阻擋發布的問題。</p>}</section><section className="validation-panel validation-panel--warning"><h3>提醒（{preparation.warnings.length}）</h3>{preparation.warnings.length?<ul>{issues(preparation.warnings)}</ul>:<p>目前沒有提醒。</p>}</section></div>}
    {mediaReady&&<div className="publication-result" aria-live="polite"><strong>發布資料已準備完成</strong><span>圖片 {media?.promotedCount??0} 張已準備，既有公開圖片 {media?.legacyCount??0} 張可沿用。</span></div>}
    {media?.status==="failed"&&<div className="publication-failure" role="alert"><strong>圖片準備未完成</strong><span>請確認圖片替代文字與使用權後重新嘗試。</span></div>}
    <div className="heading-actions"><button className="button button--secondary" type="button" disabled={blocked||Boolean(working)||unavailable} onClick={()=>void check()}>{working==="check"?"檢查中…":"檢查內容"}</button><button className="button button--accent" type="button" disabled={blocked||Boolean(working)||unavailable||!ui.canPrepare} onClick={()=>void prepare()}>{working==="prepare"?"準備中…":media?.status==="failed"?"重新準備":"準備發布"}</button></div>
    {!unavailable&&<GitHubPublicationPanel client={client} snapshot={publicationTarget} publicationRecord={targetPublication} mediaPreparation={publicationTarget?.id===current?.id?media:null} allowSubmit={ui.canSend} blocked={blocked||Boolean(working)} onPublicationChange={publicationChanged}/>}
    <details className="publication-advanced"><summary>進階資訊</summary><dl><div><dt>內容版本</dt><dd>r{revision}</dd></div><div><dt>準備資料版本</dt><dd>{current?`r${current.revision}`:"尚未建立"}</dd></div><div><dt>檢查碼</dt><dd>{current?`${current.checksum.slice(0,12)}…`:"—"}</dd></div></dl></details>
    {timeline.entries.length>0&&<details className="publication-advanced"><summary>發布歷史</summary><ul>{timeline.entries.map(({publication,snapshot})=><li key={publication.id}>r{snapshot.revision}：{publicationLabels[publication.status]}{publication.prUrl&&<> · <a href={publication.prUrl} target="_blank" rel="noreferrer">前往 GitHub 檢查</a></>}</li>)}</ul></details>}
  </section>;
}
