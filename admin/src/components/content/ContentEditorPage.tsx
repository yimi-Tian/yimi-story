import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  districtOptions,
  emptyActivityForm,
  emptyClassResultForm,
  formFromCanonical,
  normalizeContentForm,
  presentValidationIssue,
  unpublishedContentState,
  sdgOptions,
  validateCanonicalContent,
  validationTargetId,
  type ActivityForm,
  type ClassResultForm,
  type ContentForm,
  type ContentType,
  type DraftStatus,
  type ValidationResult,
} from "../../content/content-contracts";
import { createContentDraft, openContentDraft, saveContentDraft, suggestNextPublicId, type ContentDraftRecord } from "../../data/content-repository";
import { downgradeValidatedAfterEdit } from "../../data/content-list";
import { getSupabaseClient } from "../../lib/supabase";
import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning";
import { ErrorState, LoadingState } from "../States";
import { DraftMediaEditor, type DraftMediaEditorHandle } from "./DraftMediaEditor";
import { PublicationPreparationPanel } from "./PublicationPreparationPanel";

const emptyValidation: ValidationResult = { valid: false, errors: [], warnings: [] };

function TextField({ field, label, value, onChange, type = "text", required = false, note, error }: { field: string; label: string; value: string; onChange(value: string): void; type?: string; required?: boolean; note?: string; error?: string }) {
  const id = validationTargetId(field);
  return <label className={error ? "field-invalid" : undefined} htmlFor={id}>{label}{required && <span className="required-mark">必填</span>}{note && <small>{note}</small>}<input id={id} type={type} value={value} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />{error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}</label>;
}

function TextAreaField({ field, label, value, onChange, note, error }: { field: string; label: string; value: string; onChange(value: string): void; note?: string; error?: string }) {
  const id = validationTargetId(field);
  return <label className={`full-field${error ? " field-invalid" : ""}`} htmlFor={id}>{label}{note && <small>{note}</small>}<textarea id={id} rows={6} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />{error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}</label>;
}

function TagField({ field, label, values, onChange, error }: { field: string; label: string; values: string[]; onChange(values: string[]): void; error?: string }) {
  const id = validationTargetId(field);
  return <label className={error ? "field-invalid" : undefined} htmlFor={id}>{label}<input id={id} value={values.join("、")} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value.split(/[、,，;；]/))} placeholder="以逗號或頓號分隔" /><small>儲存時會自動去空白、空值與重複項目。</small>{error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}</label>;
}

function MultiChecks({ field, legend, options, values, onChange, error }: { field: string; legend: string; options: string[]; values: string[]; onChange(values: string[]): void; error?: string }) {
  const all = [...new Set([...options, ...values])];
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  const id = validationTargetId(field);
  return <fieldset id={id} className={`check-group${error ? " field-invalid" : ""}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}><legend>{legend}</legend><div>{all.map((value) => <label key={value} className={options.includes(value) ? "" : "legacy-option"}><input type="checkbox" checked={values.includes(value)} onChange={() => toggle(value)} />{value}{!options.includes(value) && <small>既有值</small>}</label>)}</div>{error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}</fieldset>;
}

type ErrorFor = (field: string) => string | undefined;
function ClassFields({ form, set, errorFor }: { form: ClassResultForm; set(field: keyof ClassResultForm, value: unknown): void; errorFor: ErrorFor }) {
  return <>
    <section className="form-section"><h2>基本資料</h2><div className="form-grid"><TextField field="year" label="年度" type="number" required error={errorFor("year")} value={form.year} onChange={(value) => set("year", value)} /><TextField field="title" label="成果名稱" required error={errorFor("title")} value={form.title} onChange={(value) => set("title", value)} /><TextField field="className" label="課程名稱" required error={errorFor("className")} value={form.className} onChange={(value) => set("className", value)} /><TextField field="instructor" label="講師" required error={errorFor("instructor")} value={form.instructor} onChange={(value) => set("instructor", value)} /><MultiChecks field="districts" legend="鄉鎮" error={errorFor("districts")} options={districtOptions} values={form.districts} onChange={(value) => set("districts", value)} /><TextField field="venue" label="活動地點" required error={errorFor("venue")} value={form.venue} onChange={(value) => set("venue", value)} /></div></section>
    <section className="form-section"><h2>成果內容</h2><div className="form-grid"><TextAreaField field="description" label="成果說明" error={errorFor("description")} value={form.description} onChange={(value) => set("description", value)} /><TagField field="tags" label="標籤" error={errorFor("tags")} values={form.tags} onChange={(value) => set("tags", value)} /><MultiChecks field="sdgs" legend="SDGs" error={errorFor("sdgs")} options={sdgOptions} values={form.sdgs} onChange={(value) => set("sdgs", value)} /></div></section>
    <section className="form-section"><h2>管理資訊</h2><div className="form-grid"><TextField field="displayOrder" label="顯示順序" type="number" error={errorFor("displayOrder")} value={form.displayOrder} onChange={(value) => set("displayOrder", value)} /><TextAreaField field="publicNotes" label="公開備註" note="可能顯示於未來公開內容" error={errorFor("publicNotes")} value={form.publicNotes} onChange={(value) => set("publicNotes", value)} /><div className="internal-note"><TextAreaField field="internalNotes" label="內部備註" note="僅後台管理使用，不會發布到公開網站" error={errorFor("internalNotes")} value={form.internalNotes} onChange={(value) => set("internalNotes", value)} /></div></div></section>
  </>;
}

function ActivityFields({ form, set, errorFor }: { form: ActivityForm; set(field: keyof ActivityForm, value: unknown): void; errorFor: ErrorFor }) {
  return <>
    <section className="form-section"><h2>基本資料</h2><div className="form-grid"><TextField field="year" label="年度" type="number" required error={errorFor("year")} value={form.year} onChange={(value) => set("year", value)} /><TextField field="name" label="活動名稱" required error={errorFor("name")} value={form.name} onChange={(value) => set("name", value)} /><TextField field="startDate" label="開始日期" type="date" error={errorFor("startDate")} value={form.startDate} onChange={(value) => set("startDate", value)} /><TextField field="endDate" label="結束日期" type="date" error={errorFor("endDate")} value={form.endDate} onChange={(value) => set("endDate", value)} /><TextField field="dateLabel" label="活動日期" required note="例如：8/1～8/29" error={errorFor("dateLabel")} value={form.dateLabel} onChange={(value) => set("dateLabel", value)} /><MultiChecks field="districts" legend="鄉鎮" error={errorFor("districts")} options={districtOptions} values={form.districts} onChange={(value) => set("districts", value)} /><TextField field="venue" label="活動地點" required error={errorFor("venue")} value={form.venue} onChange={(value) => set("venue", value)} /></div></section>
    <section className="form-section"><h2>活動內容</h2><div className="form-grid"><TextField field="projectName" label="計畫名稱" error={errorFor("projectName")} value={form.projectName} onChange={(value) => set("projectName", value)} /><TextField field="activityType" label="活動類型" required error={errorFor("activityType")} value={form.activityType} onChange={(value) => set("activityType", value)} /><TextField field="topic" label="活動主題" required error={errorFor("topic")} value={form.topic} onChange={(value) => set("topic", value)} /><TextAreaField field="summary" label="活動說明" error={errorFor("summary")} value={form.summary} onChange={(value) => set("summary", value)} /><MultiChecks field="sdgs" legend="SDGs" error={errorFor("sdgs")} options={sdgOptions} values={form.sdgs} onChange={(value) => set("sdgs", value)} /><TextField field="participants" label="參與人次" note="請填本活動累計參與人次。" error={errorFor("participants")} type="number" value={form.participants} onChange={(value) => set("participants", value)} /><TextField field="partnerOrganizations" label="合作單位" error={errorFor("partnerOrganizations")} value={form.partnerOrganizations} onChange={(value) => set("partnerOrganizations", value)} /><TextField field="leader" label="講師／帶領人" error={errorFor("leader")} value={form.leader} onChange={(value) => set("leader", value)} /><TagField field="keywords" label="關鍵字" error={errorFor("keywords")} values={form.keywords} onChange={(value) => set("keywords", value)} /><TextField field="videoUrl" label="影片連結" type="url" error={errorFor("videoUrl")} value={form.videoUrl} onChange={(value) => set("videoUrl", value)} /><TextField field="relatedUrl" label="延伸連結" type="url" error={errorFor("relatedUrl")} value={form.relatedUrl} onChange={(value) => set("relatedUrl", value)} /><label className="check-single"><input id="field-featured" type="checkbox" checked={form.featured} onChange={(event) => set("featured", event.target.checked)} />首頁精選</label></div></section>
    <section className="form-section"><h2>管理資訊</h2><div className="form-grid"><TextAreaField field="publicNotes" label="公開備註" note="可能顯示於未來公開內容" error={errorFor("publicNotes")} value={form.publicNotes} onChange={(value) => set("publicNotes", value)} /><div className="internal-note"><TextAreaField field="internalNotes" label="內部備註" note="僅後台管理使用，不會發布到公開網站" error={errorFor("internalNotes")} value={form.internalNotes} onChange={(value) => set("internalNotes", value)} /></div></div></section>
  </>;
}

export function ContentEditorPage({ type, isNew = false }: { type: ContentType; isNew?: boolean }) {
  const { publicId = "" } = useParams();
  const navigate = useNavigate();
  const client = getSupabaseClient();
  const isClass = type === "class_result";
  const basePath = isClass ? "/class-results" : "/activities";
  const [record, setRecord] = useState<ContentDraftRecord | null>(null);
  const [form, setForm] = useState<ContentForm>(() => isClass ? emptyClassResultForm() : emptyActivityForm());
  const [previewId, setPreviewId] = useState("");
  const [validation, setValidation] = useState<ValidationResult>(emptyValidation);
  const [status, setStatus] = useState<DraftStatus>("draft");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageEditing, setImageEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const mediaRef = useRef<DraftMediaEditorHandle>(null);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    void openContentDraft(client, type, decodeURIComponent(publicId)).then((item) => {
      if (!active) return;
      setRecord(item); setForm(formFromCanonical(type as "class_result", item.data));
      setValidation(item.validationResult); setStatus(item.draftStatus ?? "draft"); setLoading(false);
    }).catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [client, isNew, publicId, type]);

  const year = Number(form.year) || 115;
  useEffect(() => {
    if (!isNew) return;
    let active = true;
    void suggestNextPublicId(client, type, year).then((value) => { if (active) setPreviewId(value); }).catch(() => { if (active) setPreviewId(isClass ? `CR-${year}-下一號` : `${year}-下一號`); });
    return () => { active = false; };
  }, [client, isClass, isNew, type, year]);

  useUnsavedChangesWarning(dirty || uploading || imageEditing, uploading ? "圖片仍在上傳，確定要離開嗎？" : undefined);

  const canonical = useMemo(() => {
    const withId = { ...form, id: isNew ? previewId : form.id } as ContentForm;
    return normalizeContentForm(type as "class_result", withId as ClassResultForm);
  }, [form, isNew, previewId, type]);
  const legacy = Boolean(record?.publishedSnapshotId);
  const set = (field: string, value: unknown) => {
    setForm((current) => ({ ...current, [field]: value }) as ContentForm);
    setDirty(true); setStatus((current) => downgradeValidatedAfterEdit(current));
  };
  const runValidation = () => {
    const result = validateCanonicalContent(type, canonical, legacy);
    result.warnings.push(...(mediaRef.current?.warnings() ?? []));
    setValidation(result); setStatus(result.valid ? "validated" : "draft");
    return result;
  };
  const save = async () => {
    if (saving) return;
    setSaving(true); setFailed(false);
    try {
      const result = runValidation();
      const desiredStatus: DraftStatus = result.valid ? "validated" : "draft";
      if (isNew) {
        const created = await createContentDraft(client, type, Number(canonical.year), canonical, result);
        setDirty(false);
        navigate(`${basePath}/${encodeURIComponent(created.publicId)}`, { replace: true });
      } else if (record?.draftId) {
        const saved = await saveContentDraft(client, record.draftId, canonical, result, desiredStatus, mediaRef.current?.metadata() ?? []);
        await mediaRef.current?.afterSave();
        setRecord({ ...record, data: canonical, validationResult: result, revision: saved.revision, draftStatus: saved.status, updatedAt: saved.updatedAt });
        setStatus(saved.status); setDirty(false);
      }
    } catch { setFailed(true); } finally { setSaving(false); }
  };
  const cancel = async () => { if ((!dirty && !uploading) || window.confirm(uploading ? "圖片仍在上傳，確定要離開嗎？" : "尚有未儲存的變更，確定要取消嗎？")) { await mediaRef.current?.cleanupTemporary(); setDirty(false); navigate(basePath); } };
  const preview = () => {
    if (dirty || uploading) {
      window.alert("目前有尚未儲存的變更，請先儲存草稿後再預覽。");
      return;
    }
    if (!record?.publicId) return;
    navigate(`${basePath}/${encodeURIComponent(record.publicId)}/preview`);
  };
  const setMediaReferences = useCallback((coverAssetId: string | null, galleryAssetIds: string[]) => {
    setForm((current) => ({ ...current, coverAssetId, galleryAssetIds }) as ContentForm);
  }, []);
  const markMediaDirty = useCallback(() => { setDirty(true); setStatus((current) => downgradeValidatedAfterEdit(current)); }, []);
  const markUploading = useCallback((value: boolean) => setUploading(value), []);
  const markImageEditing = useCallback((value:boolean)=>setImageEditing(value),[]);
  const imageVersionSaved = useCallback((coverAssetId:string|null,galleryAssetIds:string[],saved:{revision:number;status:"draft";updatedAt:string})=>{
    setForm((current)=>({...current,coverAssetId,galleryAssetIds}) as ContentForm);
    setRecord((current)=>current?{...current,data:{...current.data,coverAssetId,galleryAssetIds} as typeof current.data,revision:Math.max(current.revision??0,saved.revision),draftStatus:"draft",updatedAt:saved.updatedAt}:current);
    setValidation((current)=>({...current,valid:false}));setStatus("draft");
  },[]);
  const presentedValidation = useMemo(() => ({
    errors: validation.errors.map(presentValidationIssue),
    warnings: validation.warnings.map(presentValidationIssue),
  }), [validation]);
  const errorFor = useCallback((field: string) => presentedValidation.errors.find((issue) => issue.canonicalField === field)?.message, [presentedValidation.errors]);
  const focusIssue = (targetId: string) => {
    const target = document.getElementById(targetId);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    const focusable = target?.matches("input,textarea,select,button") ? target : target?.querySelector<HTMLElement>("input,textarea,select,button");
    window.setTimeout(() => focusable?.focus(), 150);
  };

  if (loading) return <LoadingState label="正在建立或讀取草稿" />;
  if (failed && !record && !isNew) return <ErrorState message="無法讀取內容，請確認網路連線與管理員權限。" />;
  return <>
    <div className="page-heading"><div><p className="eyebrow">{isNew ? "新增內容" : "編輯內容"}</p><h1>{isNew ? `新增${isClass ? "班級花絮" : "活動成果"}` : String((form as ClassResultForm).title || (form as ActivityForm).name)}</h1><p className="muted">內容編號：<code>{isNew ? previewId : form.id}</code>{isNew && "（預覽；儲存時由系統安全配置）"}</p></div><div className="heading-actions"><button className="button button--ghost" type="button" onClick={() => void cancel()}>取消</button><button className="button button--secondary" type="button" disabled={isNew || saving} onClick={preview}>預覽</button><button className="button button--accent" type="button" disabled={saving || uploading} onClick={() => void save()}>{uploading ? "圖片上傳中…" : saving ? "儲存中…" : "儲存草稿"}</button></div></div>
    {failed && <div className="form-error" role="alert">儲存失敗，請確認權限或網路連線後再試。</div>}
    <section className="version-panel"><div><span>目前網站版本</span><strong>{record?.publishedAt ? `正式版本${record.publishedRevision ? ` r${record.publishedRevision}` : ""}` : "尚未發布"}</strong>{record?.publishedAt&&<small>版本建立時間 {new Date(record.publishedAt).toLocaleString("zh-TW")}</small>}</div><div><span>最新草稿</span><strong>{record?.revision ? `r${record.revision}` : "建立後為 r1"}</strong><small>{record?.updatedAt ? `最後更新 ${new Date(record.updatedAt).toLocaleString("zh-TW")}` : "尚未儲存"}</small></div><span className={`record-status ${dirty ? "has-draft" : ""}`}>{dirty ? "有尚未儲存的變更" : record?.publishedSnapshotId && record.draftId ? unpublishedContentState(record) === "synced" ? "內容已同步" : unpublishedContentState(record) === "changed" ? "已發布・有未發布修改" : "內容比對暫不可用" : status === "validated" ? "可準備發布" : "草稿"}</span></section>
    {dirty && <div className="unsaved-notice" role="status"><strong>有尚未儲存的變更</strong><span>請先儲存目前修改，再進行發布。</span></div>}
    <div className="validation-grid" aria-live="polite"><section className="validation-panel validation-panel--error"><h2>{presentedValidation.errors.length ? `需要修正 ${presentedValidation.errors.length} 項` : "沒有需要修正的項目"}</h2>{presentedValidation.errors.length ? <ul>{presentedValidation.errors.map((issue, index) => <li key={`${issue.code}-${index}`}><button type="button" className="validation-link" onClick={() => focusIssue(issue.targetId)}><strong>{issue.field}</strong>：{issue.message}</button></li>)}</ul> : <p>目前沒有驗證錯誤。</p>}</section><section className="validation-panel validation-panel--warning"><h2>提醒（{presentedValidation.warnings.length}）</h2>{presentedValidation.warnings.length ? <ul>{presentedValidation.warnings.map((issue, index) => <li key={`${issue.code}-${index}`}><button type="button" className="validation-link" onClick={() => focusIssue(issue.targetId)}><strong>{issue.field}</strong>：{issue.message}</button></li>)}</ul> : <p>目前沒有提醒。</p>}</section></div>
    <form className="content-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>{isClass ? <ClassFields form={form as ClassResultForm} set={set} errorFor={errorFor} /> : <ActivityFields form={form as ActivityForm} set={set} errorFor={errorFor} />}
      {record?.draftId ? <DraftMediaEditor ref={mediaRef} client={client} contentId={record.contentId} draftId={record.draftId} coverAssetId={form.coverAssetId} galleryAssetIds={form.galleryAssetIds} onReferences={setMediaReferences} onDirty={markMediaDirty} onUploading={markUploading} onEditing={markImageEditing} onVersionSaved={imageVersionSaved} /> : <section className="form-section media-readonly"><h2>圖片</h2><p className="muted">請先儲存文字草稿，再上傳圖片。</p></section>}
    </form>
    {record?.draftId && record.revision ? <PublicationPreparationPanel contentState={unpublishedContentState(record)} client={client} contentId={record.contentId} draftId={record.draftId} revision={record.revision} draftStatus={status} blocked={dirty || saving || uploading || imageEditing} /> : null}
  </>;
}
