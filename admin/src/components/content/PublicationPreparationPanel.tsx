import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPublicationSnapshots, requestPublicationPreparation, type PublicationPreparation, type PublicationSnapshotSummary } from "../../data/publication-repository";
import { PublicationMediaPreparationPanel } from "./PublicationMediaPreparationPanel";

interface Props {
  client: SupabaseClient;
  contentId: string;
  draftId: string;
  revision: number;
  draftStatus: string;
  blocked: boolean;
}

const messageFor = (error: unknown) => error instanceof Error && error.message === "PUBLICATION_STALE_REVISION"
  ? "草稿版本已變更，請重新整理後再檢查。"
  : "發布前作業失敗，請確認草稿狀態、權限與網路連線。";

export function PublicationPreparationPanel({ client, contentId, draftId, revision, draftStatus, blocked }: Props) {
  const [preparation, setPreparation] = useState<PublicationPreparation | null>(null);
  const [snapshots, setSnapshots] = useState<PublicationSnapshotSummary[]>([]);
  const [working, setWorking] = useState<"validate" | "create" | null>(null);
  const [error, setError] = useState("");

  const loadHistory = async () => setSnapshots(await fetchPublicationSnapshots(client, contentId));
  useEffect(() => {
    let active = true;
    setPreparation(null); setError("");
    void fetchPublicationSnapshots(client, contentId).then((rows) => { if (active) setSnapshots(rows); }).catch(() => { if (active) setError("無法讀取發布快照紀錄。"); });
    return () => { active = false; };
  }, [client, contentId, revision]);

  const run = async (action: "validate" | "create") => {
    setWorking(action); setError("");
    try {
      if (action === "create" && !window.confirm(`將以目前草稿版本 r${revision} 建立不可變更的發布快照。\n此步驟不會立即更新公開網站。`)) return;
      const result = await requestPublicationPreparation(client, draftId, revision, action);
      setPreparation(result.preparation);
      if (action === "create") await loadHistory();
    } catch (caught) { setError(messageFor(caught)); }
    finally { setWorking(null); }
  };

  const current = snapshots.find((snapshot) => snapshot.revision === revision);
  const mediaCandidate = current ?? snapshots[0] ?? null;
  return <section className="form-section publication-panel" aria-labelledby="publication-title">
    <div className="publication-panel__heading"><div><p className="eyebrow">Stage 7A</p><h2 id="publication-title">發布前準備</h2><p className="muted">建立不可變更的準備快照；不會更新公開網站，也不會送出 GitHub 發布。</p></div><span className="record-status">{current ? "發布快照已建立・尚未公開" : "尚未建立發布快照"}</span></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {preparation && <div className="validation-grid" aria-live="polite">
      <section className="validation-panel validation-panel--error"><h3>阻擋問題（{preparation.errors.length}）</h3>{preparation.errors.length ? <ul>{preparation.errors.map((item, index) => <li key={`${item.code}-${index}`}><strong>{item.field}</strong>：{item.message}</li>)}</ul> : <p>最終檢查沒有阻擋問題。</p>}</section>
      <section className="validation-panel validation-panel--warning"><h3>提醒（{preparation.warnings.length}）</h3>{preparation.warnings.length ? <ul>{preparation.warnings.map((item, index) => <li key={`${item.code}-${index}`}><strong>{item.field}</strong>：{item.message}</li>)}</ul> : <p>目前沒有提醒。</p>}</section>
    </div>}
    {current && <div className="publication-result"><strong>發布快照已建立</strong><span>草稿版本 r{current.revision}・checksum {current.checksum.slice(0, 12)}…</span><span>建立時間 {new Date(current.createdAt).toLocaleString("zh-TW")}・尚未公開</span><small>下一步將於後續階段處理正式圖片與網站發布。</small></div>}
    {snapshots.length > 0 && <div className="publication-history"><h3>發布快照紀錄</h3><ul>{snapshots.slice(0, 3).map((snapshot) => <li key={`${snapshot.revision}-${snapshot.checksum}`}><span>r{snapshot.revision}｜{new Date(snapshot.createdAt).toLocaleDateString("zh-TW")}｜{snapshot.checksum.slice(0, 8)}…</span><strong>{snapshot.revision === revision ? "目前草稿版本・尚未公開" : "不是目前最新草稿版本"}</strong></li>)}</ul></div>}
    <div className="heading-actions">
      <button className="button button--secondary" type="button" disabled={blocked || Boolean(working)} onClick={() => void run("validate")}>{working === "validate" ? "檢查中…" : "發布前檢查"}</button>
      <button className="button button--accent" type="button" disabled={blocked || draftStatus !== "validated" || !preparation?.valid || Boolean(working) || Boolean(current)} onClick={() => void run("create")}>{working === "create" ? "建立中…" : current ? "已建立目前版本" : "建立發布快照"}</button>
    </div>
    {blocked && <small className="muted">請先完成並儲存目前的文字或圖片變更。</small>}
    <PublicationMediaPreparationPanel client={client} snapshot={mediaCandidate} currentRevision={revision} />
  </section>;
}
