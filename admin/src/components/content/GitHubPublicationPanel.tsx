import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchGitHubPublication, finalizeGitHubPublication, requestGitHubPublication,
  type GitHubPublication, type PublicationMediaPreparation, type PublicationSnapshotSummary,
} from "../../data/publication-repository";

interface Props { client: SupabaseClient; snapshot: PublicationSnapshotSummary | null; mediaPreparation: PublicationMediaPreparation | null }
const label: Record<string, string> = {
  dry_run_ready: "發布內容已檢查", branch_created: "發布分支已建立", open: "Draft PR 等待人工檢查",
  merged: "PR 已合併", deploy_pending: "等待公開網站部署", deployed: "公開網站已部署", finalized: "發布完成",
  failed: "發布作業失敗", cancelled: "發布作業已取消", creating: "準備中",
};
function message(error: unknown): string {
  const code = error instanceof Error ? error.message : "GITHUB_PUBLICATION_FAILED";
  if (code === "MAIN_CHANGED") return "main 已有新變更，請重新執行發布內容檢查。";
  if (code === "PAGES_DEPLOYMENT_PENDING") return "GitHub Pages 尚在部署，請稍後重新確認。";
  if (code === "PULL_REQUEST_NOT_MERGED") return "Draft PR 尚未由管理員人工合併。";
  if (code === "ACTIVE_PUBLICATION_EXISTS") return "此內容已有進行中的發布作業。";
  return "網站發布作業未完成，請稍後再試或聯絡系統管理員。";
}

export function GitHubPublicationPanel({ client, snapshot, mediaPreparation }: Props) {
  const [publication, setPublication] = useState<GitHubPublication | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setPublication(null); setError("");
    if (!snapshot) return () => { active = false; };
    void fetchGitHubPublication(client, snapshot.id).then((value) => { if (active) setPublication(value); })
      .catch(() => { if (active) setError("無法讀取網站發布狀態。"); });
    return () => { active = false; };
  }, [client, snapshot]);
  const run = async (action: "dry_run" | "create_draft_pr" | "refresh_status" | "cancel" | "finalize") => {
    if (!snapshot) return;
    if (action === "create_draft_pr" && !window.confirm("將建立 GitHub Draft PR，仍須由管理員到 GitHub 人工檢查及合併。")) return;
    if (action === "cancel" && !window.confirm("將關閉尚未合併的 Draft PR，並刪除本次發布分支。")) return;
    setWorking(action); setError("");
    try { setPublication(action === "finalize" ? await finalizeGitHubPublication(client, snapshot.id) : await requestGitHubPublication(client, snapshot.id, action)); }
    catch (caught) { setError(message(caught)); }
    finally { setWorking(null); }
  };
  const ready = snapshot?.schemaVersion === "1.1" && mediaPreparation?.status === "ready";
  const status = publication?.status;
  return <section className="publication-media-panel" aria-labelledby="github-publication-title">
    <div className="publication-panel__heading"><div><p className="eyebrow">Stage 7C</p><h3 id="github-publication-title">網站發布</h3><p className="muted">先檢查六個正式資料檔，再建立 Draft PR；GitHub 合併仍由管理員人工完成。</p></div><span className="record-status">{status ? label[status] ?? status : "尚未開始"}</span></div>
    {!snapshot && <p className="muted">網站發布需先完成前述快照與正式圖片準備。</p>}
    {snapshot && snapshot.schemaVersion !== "1.1" && <div className="form-error">舊版發布快照不支援網站發布，請建立 1.1 新版快照。</div>}
    {snapshot?.schemaVersion === "1.1" && mediaPreparation?.status !== "ready" && <p className="muted">請先完成正式圖片準備。</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {publication && <div className="publication-result" aria-live="polite">
      <strong>{label[publication.status] ?? publication.status}</strong>
      {publication.beforeCounts && publication.afterCounts && <span>班級 {publication.beforeCounts.classResults} → {publication.afterCounts.classResults}・活動 {publication.beforeCounts.activities} → {publication.afterCounts.activities}</span>}
      <span>變更檔案：{publication.changedFiles.length}（僅限正式資料白名單）</span>
      {publication.prUrl && <a href={publication.prUrl} target="_blank" rel="noreferrer">前往 GitHub 人工檢查 Draft PR #{publication.prNumber}</a>}
    </div>}
    <div className="heading-actions">
      {!publication && <button className="button button--secondary" type="button" disabled={!ready || Boolean(working)} onClick={() => void run("dry_run")}>{working === "dry_run" ? "檢查中…" : "檢查網站發布內容"}</button>}
      {status === "dry_run_ready" && <button className="button button--accent" type="button" disabled={Boolean(working)} onClick={() => void run("create_draft_pr")}>{working ? "建立中…" : "建立 GitHub Draft PR"}</button>}
      {status && ["open", "merged", "deploy_pending"].includes(status) && <button className="button button--secondary" type="button" disabled={Boolean(working)} onClick={() => void run("refresh_status")}>重新確認發布狀態</button>}
      {status === "deployed" && <button className="button button--accent" type="button" disabled={Boolean(working)} onClick={() => void run("finalize")}>確認公開並完成發布</button>}
      {status && ["dry_run_ready", "branch_created", "open", "failed"].includes(status) && <button className="button button--secondary" type="button" disabled={Boolean(working)} onClick={() => void run("cancel")}>取消本次發布</button>}
    </div>
    <small className="muted">系統不會自動合併 PR，也不會把 GitHub 憑證送到瀏覽器。</small>
  </section>;
}
