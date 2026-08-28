import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  districtOptions,
  emptyActivityForm,
  emptyClassResultForm,
  formFromCanonical,
  normalizeContentForm,
  sdgOptions,
  validateCanonicalContent,
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

function TextField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange(value: string): void; type?: string; required?: boolean }) {
  const id = `field-${label.replace(/\s/g, "-")}`;
  return <label htmlFor={id}>{label}{required && <span className="required-mark">必填</span>}<input id={id} type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextAreaField({ label, value, onChange, note }: { label: string; value: string; onChange(value: string): void; note?: string }) {
  const id = `field-${label.replace(/\s/g, "-")}`;
  return <label className="full-field" htmlFor={id}>{label}{note && <small>{note}</small>}<textarea id={id} rows={6} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TagField({ label, values, onChange }: { label: string; values: string[]; onChange(values: string[]): void }) {
  const id = `field-${label}`;
  return <label htmlFor={id}>{label}<input id={id} value={values.join("、")} onChange={(event) => onChange(event.target.value.split(/[、,，;；]/))} placeholder="以逗號或頓號分隔" /><small>儲存時會自動去空白、空值與重複項目。</small></label>;
}

function MultiChecks({ legend, options, values, onChange }: { legend: string; options: string[]; values: string[]; onChange(values: string[]): void }) {
  const all = [...new Set([...options, ...values])];
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  return <fieldset className="check-group"><legend>{legend}</legend><div>{all.map((value) => <label key={value} className={options.includes(value) ? "" : "legacy-option"}><input type="checkbox" checked={values.includes(value)} onChange={() => toggle(value)} />{value}{!options.includes(value) && <small>既有值</small>}</label>)}</div></fieldset>;
}

function ClassFields({ form, set }: { form: ClassResultForm; set(field: keyof ClassResultForm, value: unknown): void }) {
  return <>
    <section className="form-section"><h2>基本資料</h2><div className="form-grid"><TextField label="年度" type="number" required value={form.year} onChange={(value) => set("year", value)} /><TextField label="標題" required value={form.title} onChange={(value) => set("title", value)} /><TextField label="課程名稱" required value={form.className} onChange={(value) => set("className", value)} /><TextField label="講師" required value={form.instructor} onChange={(value) => set("instructor", value)} /><MultiChecks legend="地區" options={districtOptions} values={form.districts} onChange={(value) => set("districts", value)} /><TextField label="場地" required value={form.venue} onChange={(value) => set("venue", value)} /></div></section>
    <section className="form-section"><h2>成果內容</h2><div className="form-grid"><TextAreaField label="內容描述" value={form.description} onChange={(value) => set("description", value)} /><TagField label="標籤" values={form.tags} onChange={(value) => set("tags", value)} /><MultiChecks legend="SDGs" options={sdgOptions} values={form.sdgs} onChange={(value) => set("sdgs", value)} /></div></section>
    <section className="form-section"><h2>管理資訊</h2><div className="form-grid"><TextField label="顯示順序" type="number" value={form.displayOrder} onChange={(value) => set("displayOrder", value)} /><TextAreaField label="公開備註" note="可能顯示於未來公開內容" value={form.publicNotes} onChange={(value) => set("publicNotes", value)} /><div className="internal-note"><TextAreaField label="內部備註" note="僅後台管理使用，不會發布到公開網站" value={form.internalNotes} onChange={(value) => set("internalNotes", value)} /></div></div></section>
  </>;
}

function ActivityFields({ form, set }: { form: ActivityForm; set(field: keyof ActivityForm, value: unknown): void }) {
  return <>
    <section className="form-section"><h2>基本資料</h2><div className="form-grid"><TextField label="年度" type="number" required value={form.year} onChange={(value) => set("year", value)} /><TextField label="活動名稱" required value={form.name} onChange={(value) => set("name", value)} /><TextField label="開始日期" type="date" value={form.startDate} onChange={(value) => set("startDate", value)} /><TextField label="結束日期" type="date" value={form.endDate} onChange={(value) => set("endDate", value)} /><TextField label="日期顯示" required value={form.dateLabel} onChange={(value) => set("dateLabel", value)} /><MultiChecks legend="地區" options={districtOptions} values={form.districts} onChange={(value) => set("districts", value)} /><TextField label="場地" required value={form.venue} onChange={(value) => set("venue", value)} /></div></section>
    <section className="form-section"><h2>活動內容</h2><div className="form-grid"><TextField label="計畫名稱" value={form.projectName} onChange={(value) => set("projectName", value)} /><TextField label="活動類型" required value={form.activityType} onChange={(value) => set("activityType", value)} /><TextField label="活動主題" required value={form.topic} onChange={(value) => set("topic", value)} /><TextAreaField label="活動摘要" value={form.summary} onChange={(value) => set("summary", value)} /><MultiChecks legend="SDGs" options={sdgOptions} values={form.sdgs} onChange={(value) => set("sdgs", value)} /><TextField label="參加人數" type="number" value={form.participants} onChange={(value) => set("participants", value)} /><TextField label="合作單位" value={form.partnerOrganizations} onChange={(value) => set("partnerOrganizations", value)} /><TextField label="講師／帶領者" value={form.leader} onChange={(value) => set("leader", value)} /><TagField label="關鍵字" values={form.keywords} onChange={(value) => set("keywords", value)} /><TextField label="影片網址" type="url" value={form.videoUrl} onChange={(value) => set("videoUrl", value)} /><TextField label="相關網址" type="url" value={form.relatedUrl} onChange={(value) => set("relatedUrl", value)} /><label className="check-single"><input type="checkbox" checked={form.featured} onChange={(event) => set("featured", event.target.checked)} />首頁精選</label></div></section>
    <section className="form-section"><h2>管理資訊</h2><div className="form-grid"><TextAreaField label="公開備註" note="可能顯示於未來公開內容" value={form.publicNotes} onChange={(value) => set("publicNotes", value)} /><div className="internal-note"><TextAreaField label="內部備註" note="僅後台管理使用，不會發布到公開網站" value={form.internalNotes} onChange={(value) => set("internalNotes", value)} /></div></div></section>
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

  useUnsavedChangesWarning(dirty || uploading || imageEditing);

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
      const desiredStatus: DraftStatus = status === "validated" && result.valid ? "validated" : "draft";
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
  const cancel = async () => { if ((!dirty && !uploading) || window.confirm("尚有未儲存的變更，確定要取消嗎？")) { await mediaRef.current?.cleanupTemporary(); setDirty(false); navigate(basePath); } };
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
    setRecord((current)=>current?{...current,data:{...current.data,coverAssetId,galleryAssetIds} as typeof current.data,revision:saved.revision,draftStatus:"draft",updatedAt:saved.updatedAt}:current);
    setValidation((current)=>({...current,valid:false}));setStatus("draft");
  },[]);

  if (loading) return <LoadingState label="正在建立或讀取草稿" />;
  if (failed && !record && !isNew) return <ErrorState message="無法讀取內容，請確認網路連線與管理員權限。" />;
  return <>
    <div className="page-heading"><div><p className="eyebrow">{isNew ? "New draft" : "Edit draft"}</p><h1>{isNew ? `新增${isClass ? "班級花絮" : "活動成果"}` : String((form as ClassResultForm).title || (form as ActivityForm).name)}</h1><p className="muted">Public ID：<code>{isNew ? previewId : form.id}</code>{isNew && "（預覽；儲存時由資料庫安全配置）"}</p></div><div className="heading-actions"><button className="button button--ghost" type="button" onClick={() => void cancel()}>取消</button><button className="button button--secondary" type="button" disabled={isNew || saving} onClick={preview}>預覽</button><button className="button button--secondary" type="button" disabled={saving || uploading} onClick={runValidation}>檢查內容</button><button className="button button--accent" type="button" disabled={saving || uploading} onClick={() => void save()}>{uploading ? "圖片上傳中…" : saving ? "儲存中…" : "儲存草稿"}</button></div></div>
    {failed && <div className="form-error" role="alert">儲存失敗，請確認權限或網路連線後再試。</div>}
    <section className="version-panel"><div><span>目前正式版本</span><strong>{record?.publishedAt ? new Date(record.publishedAt).toLocaleString("zh-TW") : "尚未發布"}</strong></div><div><span>草稿版本</span><strong>{record?.revision ? `r${record.revision}` : "建立後為 r1"}</strong><small>{record?.updatedAt ? `最後更新 ${new Date(record.updatedAt).toLocaleString("zh-TW")}` : "尚未儲存"}</small></div><span className={`record-status ${dirty ? "has-draft" : ""}`}>{dirty ? "有未儲存變更" : status === "validated" ? "已檢查" : "草稿"}</span></section>
    <div className="validation-grid" aria-live="polite"><section className="validation-panel validation-panel--error"><h2>錯誤（{validation.errors.length}）</h2>{validation.errors.length ? <ul>{validation.errors.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.field}</strong>：{issue.message}</li>)}</ul> : <p>目前沒有驗證錯誤。</p>}</section><section className="validation-panel validation-panel--warning"><h2>提醒（{validation.warnings.length}）</h2>{validation.warnings.length ? <ul>{validation.warnings.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.field}</strong>：{issue.message}</li>)}</ul> : <p>目前沒有驗證提醒。</p>}</section></div>
    {record?.draftId && record.revision ? <PublicationPreparationPanel client={client} contentId={record.contentId} draftId={record.draftId} revision={record.revision} draftStatus={status} blocked={dirty || saving || uploading || imageEditing} /> : null}
    <form className="content-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>{isClass ? <ClassFields form={form as ClassResultForm} set={set} /> : <ActivityFields form={form as ActivityForm} set={set} />}
      {record?.draftId ? <DraftMediaEditor ref={mediaRef} client={client} contentId={record.contentId} draftId={record.draftId} coverAssetId={form.coverAssetId} galleryAssetIds={form.galleryAssetIds} onReferences={setMediaReferences} onDirty={markMediaDirty} onUploading={markUploading} onEditing={markImageEditing} onVersionSaved={imageVersionSaved} /> : <section className="form-section media-readonly"><h2>圖片</h2><p className="muted">請先儲存文字草稿，再上傳圖片。</p></section>}
    </form>
  </>;
}
