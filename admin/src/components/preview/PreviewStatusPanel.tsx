import type { DraftPreviewModel } from "../../preview/preview-model";

export function PreviewStatusPanel({ model }: { model: DraftPreviewModel }) {
  const errors = model.validation.errors.length;
  const warnings = model.validation.warnings.length;
  const title = model.source === "published" ? "目前正式版本預覽" : model.source === "new_draft" ? "新內容草稿" : "草稿預覽";
  return <section className={`preview-status ${model.source === "published" ? "is-published" : "is-draft"}`} aria-label="預覽狀態">
    <div><span className="preview-status__label">{title}</span>{model.source !== "published" && <strong>尚未發布</strong>}</div>
    <div className="preview-status__checks"><span>內容檢查</span>{model.revision !== null && <strong>草稿版本 r{model.revision}</strong>}<strong>{model.draftStatus === "validated" ? "已通過內容檢查" : model.source === "published" ? "目前正式內容" : "草稿"}</strong><span>{errors} 個錯誤</span><span>{warnings} 個提醒</span></div>
    {errors > 0 && <p className="preview-status__error">目前有 {errors} 項錯誤，尚不適合發布。</p>}
    {warnings > 0 && <p className="preview-status__warning">目前有 {warnings} 項提醒。</p>}
    {model.unavailableDraftImages > 0 && <p className="preview-status__warning">{model.unavailableDraftImages} 張草稿圖片暫時無法預覽。</p>}
  </section>;
}
