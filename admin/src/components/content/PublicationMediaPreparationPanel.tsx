import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchPublicationMediaPreparation,
  requestPublicationMediaPreparation,
  type PublicationMediaPreparation,
  type PublicationSnapshotSummary,
} from "../../data/publication-repository";
import { GitHubPublicationPanel } from "./GitHubPublicationPanel";

interface Props {
  client: SupabaseClient;
  snapshot: PublicationSnapshotSummary | null;
  currentRevision: number;
}

const errorMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : "PROMOTION_FAILED";
  if (code === "SNAPSHOT_NOT_READY") return "此發布快照不符合正式圖片準備條件，請重新建立目前版本的發布快照。";
  if (code === "SOURCE_MEDIA_MISSING" || code === "SOURCE_OBJECT_MISSING") return "草稿圖片已不存在，正式圖片準備未完成。";
  if (code === "SOURCE_CHECKSUM_MISMATCH") return "草稿圖片完整性檢查失敗，正式圖片準備未完成。";
  if (code === "DESTINATION_CONFLICT" || code === "PUBLIC_MEDIA_VERIFY_FAILED") return "正式圖片驗證失敗，系統沒有覆寫既有檔案。";
  return "正式圖片準備未完成，請確認網路連線後重新嘗試。";
};

export function PublicationMediaPreparationPanel({ client, snapshot, currentRevision }: Props) {
  const [preparation, setPreparation] = useState<PublicationMediaPreparation | null>(null);
  const [loading, setLoading] = useState(Boolean(snapshot));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setPreparation(null); setError(""); setLoading(Boolean(snapshot));
    if (!snapshot) return () => { active = false; };
    void fetchPublicationMediaPreparation(client, snapshot.id)
      .then((result) => { if (active) setPreparation(result); })
      .catch(() => { if (active) setError("無法讀取正式圖片準備狀態。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, snapshot]);

  const prepare = async () => {
    if (!snapshot) return;
    const confirmed = window.confirm("將依此發布快照準備正式圖片。\n此步驟不會更新公開網站、不會送出 GitHub 發布，也不會刪除草稿圖片。");
    if (!confirmed) return;
    setWorking(true); setError("");
    try { setPreparation(await requestPublicationMediaPreparation(client, snapshot.id)); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setWorking(false); }
  };

  const compatible = snapshot?.schemaVersion === "1.1";
  const ready = preparation?.status === "ready";
  const failed = preparation?.status === "failed";
  const preparing = preparation?.status === "preparing";
  return <section className="publication-media-panel" aria-labelledby="publication-media-title">
    <div className="publication-panel__heading"><div><p className="eyebrow">Stage 7B</p><h3 id="publication-media-title">正式圖片準備</h3><p className="muted">依發布快照準備正式圖片；完成後仍尚未公開。</p></div><span className="record-status">{ready ? "準備完成・尚未公開" : failed ? "準備失敗" : preparing ? "準備中" : "尚未準備"}</span></div>
    {!snapshot && <p className="muted">請先建立發布快照，才能準備正式圖片。</p>}
    {snapshot && !compatible && <div className="form-error" role="alert">此舊版發布快照不能直接準備正式圖片，請建立新版發布快照。</div>}
    {snapshot && snapshot.revision !== currentRevision && <p className="publication-notice">此發布快照不是目前最新草稿版本；作業仍只會依此快照處理。</p>}
    {loading && <p className="muted">正在讀取準備狀態…</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {ready && preparation && <div className="publication-result" aria-live="polite"><strong>正式圖片準備完成</strong><span>需要準備：{preparation.requiredCount}・成功：{preparation.promotedCount}・既有公開圖片：{preparation.legacyCount}</span><span>尚未公開</span><small>下一步將於後續階段建立網站發布內容與 GitHub 發布流程。</small></div>}
    {failed && preparation && <div className="publication-failure" aria-live="polite"><strong>正式圖片準備未完成</strong><span>完成：{preparation.promotedCount}・失敗：{Math.max(preparation.failedCount, 1)}</span><small>可重新嘗試；系統不會覆寫既有正式圖片。</small></div>}
    <button className="button button--accent" type="button" disabled={!snapshot || !compatible || loading || working || ready} onClick={() => void prepare()}>{working ? "準備中…" : failed ? "重新嘗試" : ready ? "正式圖片準備完成" : "準備正式圖片"}</button>
    <GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={preparation} />
  </section>;
}
