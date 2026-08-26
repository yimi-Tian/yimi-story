import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ContentType } from "../../content/content-contracts";
import { getPreviewSource } from "../../data/preview-repository";
import { getSupabaseClient } from "../../lib/supabase";
import type { DraftPreviewModel } from "../../preview/preview-model";
import { ErrorState, LoadingState } from "../States";
import { PreviewStatusPanel } from "./PreviewStatusPanel";
import { PublicPreview } from "./PublicPreview";

export function previewErrorKind(reason: unknown): "not_found" | "failed" {
  return reason instanceof Error && reason.message === "PREVIEW_NOT_FOUND" ? "not_found" : "failed";
}

export function DraftPreviewPage({ type }: { type: ContentType }) {
  const { publicId = "" } = useParams();
  const client = getSupabaseClient();
  const basePath = type === "class_result" ? "/class-results" : "/activities";
  const [model, setModel] = useState<DraftPreviewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"not_found" | "failed" | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setModel(await getPreviewSource(client, type, decodeURIComponent(publicId))); }
    catch (reason) { setModel(null); setError(previewErrorKind(reason)); }
    finally { setLoading(false); }
  }, [client, publicId, type]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState label="正在載入預覽" />;
  if (error === "not_found") return <section className="page-error" role="alert"><h1>找不到此筆內容</h1><p>請確認內容識別碼，或返回列表重新選擇。</p><Link className="button button--secondary" to={basePath}>返回列表</Link></section>;
  if (error || !model) return <ErrorState message="無法載入此筆預覽" />;
  return <div className="preview-page">
    <div className="preview-controls"><div><span>後台預覽控制區</span><code>{model.publicId}</code></div><div><Link className="button button--secondary" to={`${basePath}/${encodeURIComponent(model.publicId)}`}>返回編輯</Link><button className="button button--ghost" type="button" onClick={() => void load()}>重新整理預覽</button></div></div>
    <PreviewStatusPanel model={model} />
    <p className="preview-disclaimer">以下為民眾可能看到的內容；此頁僅供後台檢查，不代表已發布。</p>
    <PublicPreview model={model} />
  </div>;
}
