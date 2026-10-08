import type { WalkingRecordExtension, WalkingRecordStop, WalkingType } from "../../../../src/content-types/activity";
import { findDigitalWalk, getPublishedDigitalWalkOptions } from "../../data/digital-walk-repository";

export const walkingTypes: WalkingType[] = ["地方走讀", "聚落踏查", "流域觀察", "生態觀察", "訪談／口述", "文史採集", "產業地景", "其他"];

export function emptyWalkingRecord(): WalkingRecordExtension {
  return { type: "地方走讀", titleOverride: null, locationOverride: null, summary: "", routeSummary: null, stops: [], fieldNotes: [], digitalWalkId: null, coverAssetId: null };
}
type Props = {
  value: WalkingRecordExtension | null;
  activityCoverAssetId: string | null;
  galleryAssetIds: string[];
  walkingRecordId: string | null;
  errorFor(field: string): string | undefined;
  onChange(value: WalkingRecordExtension | null): void;
};

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function WalkingRecordFields({ value, activityCoverAssetId, galleryAssetIds, walkingRecordId, errorFor, onChange }: Props) {
  const enabled = value !== null;
  const update = (patch: Partial<WalkingRecordExtension>) => value && onChange({ ...value, ...patch });
  const toggle = (checked: boolean) => {
    if (checked) return onChange(emptyWalkingRecord());
    const hasContent = Boolean(value && (value.summary.trim() || value.titleOverride || value.locationOverride || value.routeSummary || value.stops.length || value.fieldNotes.length || value.digitalWalkId || value.coverAssetId));
    if (!hasContent || window.confirm("取消後，這筆活動的走讀與田野草稿內容將被移除。\n既有 WR ID 不會因此回收。")) onChange(null);
  };
  const updateStop = (index: number, patch: Partial<WalkingRecordStop>) => {
    if (!value) return;
    update({ stops: value.stops.map((stop, position) => position === index ? { ...stop, ...patch } : stop) });
  };
  const updateNote = (index: number, note: string) => value && update({ fieldNotes: value.fieldNotes.map((item, position) => position === index ? note : item) });
  const coverOptions = [
    ...(activityCoverAssetId ? [{ id: activityCoverAssetId, label: "活動封面" }] : []),
    ...galleryAssetIds.map((id, index) => ({ id, label: `相簿圖片 ${index + 1}` })),
  ];
  const digitalWalks = getPublishedDigitalWalkOptions();
  const linkedDigitalWalk = value?.digitalWalkId ? findDigitalWalk(value.digitalWalkId) : null;
  const retiredDigitalWalk = value?.digitalWalkId && !digitalWalks.some((route) => route.id === value.digitalWalkId)
    ? { id: value.digitalWalkId, title: linkedDigitalWalk?.title ?? value.digitalWalkId }
    : null;

  return <section id="walking-section" className="form-section walking-section">
    <div className="walking-section__heading"><div><h2>走讀與田野紀錄</h2><p className="muted">沿用活動日期、鄉鎮、地點、標題與圖片，不需重複輸入。</p></div><label className="check-single"><input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} />建立走讀與田野紀錄</label></div>
    {!enabled ? <p className="media-empty">此活動尚未建立走讀與田野紀錄。</p> : <div className="walking-fields">
      <div className="walking-identity"><span>WR ID</span><strong>{walkingRecordId ?? "將於後端建立識別碼"}</strong><small>首次成功儲存走讀資料時由系統配置，不會因活動標題修改而變更。</small></div>
      <div className="form-grid">
        <label htmlFor="field-walking-type">走讀／田野類型<span className="required-mark">必填</span><select id="field-walking-type" value={value.type} aria-invalid={Boolean(errorFor("walkingRecord.type"))} onChange={(event) => update({ type: event.target.value as WalkingType })}>{walkingTypes.map((type) => <option key={type}>{type}</option>)}</select>{errorFor("walkingRecord.type") && <small className="field-error">{errorFor("walkingRecord.type")}</small>}</label>
        <label htmlFor="field-walking-title">走讀頁標題<small>留空則沿用活動名稱。</small><input id="field-walking-title" value={value.titleOverride ?? ""} onChange={(event) => update({ titleOverride: event.target.value || null })} />{errorFor("walkingRecord.titleOverride") && <small className="field-error">{errorFor("walkingRecord.titleOverride")}</small>}</label>
        <label htmlFor="field-walking-location">走讀地點顯示（選填）<small>留空則沿用活動地點；只有走讀頁需要不同的地點描述時才填寫。</small><input id="field-walking-location" value={value.locationOverride ?? ""} onChange={(event) => update({ locationOverride: event.target.value || null })} />{errorFor("walkingRecord.locationOverride") && <small className="field-error">{errorFor("walkingRecord.locationOverride")}</small>}</label>
        <label className="full-field" htmlFor="field-walking-summary">走讀摘要<span className="required-mark">必填</span><small>簡要說明這次走進哪裡、觀察什麼、記錄什麼。請不要重複活動效益或成果說明。限 20～1500 字；已輸入 {value.summary.length} 字。</small><textarea id="field-walking-summary" rows={6} value={value.summary} onChange={(event) => update({ summary: event.target.value })} />{errorFor("walkingRecord.summary") && <small className="field-error">{errorFor("walkingRecord.summary")}</small>}</label>
        <label className="full-field" htmlFor="field-walking-route-summary">走讀範圍摘要<small>可說明此次田野涵蓋的聚落、路線或觀察範圍；若無法確認實際行走順序，不需寫成第一站、第二站。</small><textarea id="field-walking-route-summary" rows={4} value={value.routeSummary ?? ""} onChange={(event) => update({ routeSummary: event.target.value || null })} />{errorFor("walkingRecord.routeSummary") && <small className="field-error">{errorFor("walkingRecord.routeSummary")}</small>}</label>
      </div>

      <fieldset id="walking-stops" className="walking-repeater"><legend>走訪地點／站點</legend>{value.stops.map((stop, index) => <div className="walking-repeater__row" key={index}>
        <label htmlFor={`walking-stop-${index}-name`}>站點名稱<span className="required-mark">必填</span><input id={`walking-stop-${index}-name`} value={stop.name} onChange={(event) => updateStop(index, { name: event.target.value })} />{errorFor(`walkingRecord.stops[${index}].name`) && <small className="field-error">{errorFor(`walkingRecord.stops[${index}].name`)}</small>}</label>
        <label htmlFor={`walking-stop-${index}-note`}>站點說明（選填）<textarea id={`walking-stop-${index}-note`} rows={2} value={stop.note ?? ""} onChange={(event) => updateStop(index, { note: event.target.value || null })} /></label>
        <div className="button-row"><button className="button button--ghost" type="button" disabled={index === 0} onClick={() => update({ stops: move(value.stops, index, -1) })}>上移</button><button className="button button--ghost" type="button" disabled={index === value.stops.length - 1} onClick={() => update({ stops: move(value.stops, index, 1) })}>下移</button><button className="button button--ghost" type="button" onClick={() => update({ stops: value.stops.filter((_, position) => position !== index) })}>刪除</button></div>
      </div>)}<button className="button button--secondary" type="button" onClick={() => update({ stops: [...value.stops, { name: "", note: null }] })}>＋新增站點</button></fieldset>

      <fieldset id="walking-field-notes" className="walking-repeater"><legend>現場觀察重點</legend><small>填寫現場實際看到、聽到或記錄到的內容。沒有資料可以不填。</small>{value.fieldNotes.map((note, index) => <div className="walking-repeater__row" key={index}><label htmlFor={`walking-field-note-${index}`}>觀察重點（選填）<textarea id={`walking-field-note-${index}`} rows={2} value={note} onChange={(event) => updateNote(index, event.target.value)} /></label><div className="button-row"><button className="button button--ghost" type="button" disabled={index === 0} onClick={() => update({ fieldNotes: move(value.fieldNotes, index, -1) })}>上移</button><button className="button button--ghost" type="button" disabled={index === value.fieldNotes.length - 1} onClick={() => update({ fieldNotes: move(value.fieldNotes, index, 1) })}>下移</button><button className="button button--ghost" type="button" onClick={() => update({ fieldNotes: value.fieldNotes.filter((_, position) => position !== index) })}>刪除</button></div></div>)}<button className="button button--secondary" type="button" onClick={() => update({ fieldNotes: [...value.fieldNotes, ""] })}>＋新增紀錄</button>{errorFor("walkingRecord.fieldNotes") && <small className="field-error">{errorFor("walkingRecord.fieldNotes")}</small>}</fieldset>

      <div className="form-grid">
        <label htmlFor="field-walking-digital-walk">關聯數位走讀<small>僅列出正式核准且公開的路線。</small><select id="field-walking-digital-walk" value={value.digitalWalkId ?? ""} onChange={(event) => update({ digitalWalkId: event.target.value || null })}><option value="">不關聯</option>{retiredDigitalWalk && <option value={retiredDigitalWalk.id}>{retiredDigitalWalk.title}（目前關聯路線已不公開）</option>}{digitalWalks.map((route) => <option key={route.id} value={route.id}>{route.title}（{route.id}）</option>)}</select>{retiredDigitalWalk && <small className="walking-warning">目前關聯路線已不公開；系統會保留原值，請確認後再調整。</small>}{errorFor("walkingRecord.digitalWalkId") && <small className="field-error">{errorFor("walkingRecord.digitalWalkId")}</small>}</label>
        <label htmlFor="field-walking-cover">走讀封面圖<small>不重新上傳；留白時沿用活動封面。</small><select id="field-walking-cover" value={value.coverAssetId ?? ""} onChange={(event) => update({ coverAssetId: event.target.value || null })}><option value="">沿用活動封面</option>{coverOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>{errorFor("walkingRecord.coverAssetId") && <small className="field-error">{errorFor("walkingRecord.coverAssetId")}</small>}</label>
      </div>
    </div>}
  </section>;
}
