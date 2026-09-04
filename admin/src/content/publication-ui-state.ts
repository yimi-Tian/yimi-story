import type { GitHubPublication, PublicationMediaPreparation, PublicationSnapshotSummary, PublicationTimeline } from "../data/publication-repository";

// Mirrors the existing one-active-publication constraint; this is a UI guard only.
const activeStatuses = new Set<GitHubPublication["status"]>(["creating", "dry_run_ready", "branch_created", "open", "merged", "deploy_pending", "deployed"]);
export const publicationLabels: Record<GitHubPublication["status"], string> = {
  creating: "正在建立發布資料", dry_run_ready: "發布內容已檢查", branch_created: "正在建立發布資料",
  open: "等待管理員確認", merged: "內容已確認，等待網站更新", deploy_pending: "網站更新中",
  deployed: "網站已更新，等待完成確認", finalized: "發布完成", failed: "發布未完成", cancelled: "本次發布已取消",
};

export function resolvePublicationUiState({ timeline, currentSnapshot, revision, mediaPreparation }: {
  timeline: PublicationTimeline; currentSnapshot: PublicationSnapshotSummary | null; revision: number;
  mediaPreparation: PublicationMediaPreparation | null;
}) {
  const active = timeline.entries.find(({ publication }) => activeStatuses.has(publication.status)) ?? null;
  const current = timeline.entries.find(({ snapshot }) => snapshot.id === currentSnapshot?.id) ?? null;
  const published = timeline.entries.find(({ snapshot, publication }) => snapshot.id === timeline.publishedSnapshot?.id && publication.status === "finalized") ?? null;
  const latest = timeline.entries[0] ?? null;
  // Old failed/cancelled attempts belong in history, never in the new draft's controls.
  const relevant = active ?? current ?? (currentSnapshot ? null : latest?.snapshot.revision === revision ? latest : published);
  const status = relevant?.publication.status ?? null;
  const ready = mediaPreparation?.status === "ready";
  const otherActive = Boolean(active && active.snapshot.id !== currentSnapshot?.id);
  const showUnpublishedChanges = Boolean(timeline.publishedSnapshot && revision > timeline.publishedSnapshot.revision);
  const primaryLabel = status ? publicationLabels[status] : ready ? "可送出發布" : showUnpublishedChanges ? "有未發布變更" : "準備中";
  const secondaryMessage = status === "failed" ? "請先取消未完成的發布作業，再修改並儲存草稿以準備新版本。"
    : status === "cancelled" ? "草稿內容已保留；修改並儲存草稿後，可準備新版本。"
    : status === "finalized" ? "此版本已完成正式發布。"
    : otherActive ? `另有一筆 r${active!.snapshot.revision} 發布正在處理；請先完成或取消該作業。`
    : status ? publicationLabels[status] : ready ? "目前尚未公開；下一步請送出網站發布。" : "";
  return {
    active, current, relevant, primaryLabel, secondaryMessage, status,
    canPrepare: !active && !current && !ready,
    canSend: !otherActive && Boolean(currentSnapshot?.schemaVersion === "1.1" && ready) && (!current || current.publication.status === "dry_run_ready"),
    showAdminWaiting: status === "open", finalized: status === "finalized",
    showPublishedVersion: Boolean(timeline.publishedSnapshot), showUnpublishedChanges,
    reviewComplete: status !== null && ["merged", "deploy_pending", "deployed", "finalized"].includes(status),
  };
}
