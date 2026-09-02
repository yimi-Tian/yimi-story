import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GitHubPublicationPanel } from "./GitHubPublicationPanel";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), request: vi.fn(), finalize: vi.fn() }));
vi.mock("../../data/publication-repository", () => ({
  fetchGitHubPublication: mocks.fetch, requestGitHubPublication: mocks.request, finalizeGitHubPublication: mocks.finalize,
}));
const client = {} as never;
const snapshot = { id: "11111111-1111-4111-8111-111111111111", revision: 7, schemaVersion: "1.1", checksum: "a".repeat(64), status: "ready", createdAt: "2026-09-02T00:00:00Z" };
const media = { status: "ready", requiredCount: 3, promotedCount: 3, legacyCount: 0, failedCount: 0, manifestChecksum: "b".repeat(64), errorCode: null } as const;
const publication = { id: "safe", snapshotId: snapshot.id, status: "dry_run_ready", branch: "publication/class-result/CR-115-057/aaaaaaaaaaaa", baseSha: "c".repeat(40), commitSha: null, prNumber: null, prUrl: null, changedFiles: ["data/class-results.json", "data/class-results-data.js"], beforeCounts: { classResults: 56, activities: 63 }, afterCounts: { classResults: 57, activities: 63 }, checkedAt: null, errorCode: null } as const;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { mocks.fetch.mockReset(); mocks.request.mockReset(); mocks.finalize.mockReset(); mocks.fetch.mockResolvedValue(null); });

test("沒有snapshot與舊版snapshot都不會crash或啟用發布", () => {
  const { rerender } = render(<GitHubPublicationPanel client={client} snapshot={null} mediaPreparation={null} />);
  expect(screen.getByRole("button", { name: "檢查網站發布內容" })).toBeDisabled();
  rerender(<GitHubPublicationPanel client={client} snapshot={{ ...snapshot, schemaVersion: "1.0" }} mediaPreparation={media} />);
  expect(screen.getByText(/舊版發布快照不支援/)).toBeInTheDocument();
});

test("ready media可執行server dry run並顯示六檔白名單摘要", async () => {
  mocks.request.mockResolvedValue(publication);
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media} />);
  fireEvent.click(await screen.findByRole("button", { name: "檢查網站發布內容" }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(client, snapshot.id, "dry_run"));
  expect(screen.getByText("班級 56 → 57・活動 63 → 63")).toBeInTheDocument();
  expect(screen.getByText("變更檔案：2（僅限正式資料白名單）")).toBeInTheDocument();
});

test("Draft PR必須人工確認且顯示GitHub連結", async () => {
  const open = { ...publication, status: "open", prNumber: 31, prUrl: "https://github.com/yimi-Tian/yimi-story/pull/31" };
  mocks.fetch.mockResolvedValue(publication); mocks.request.mockResolvedValue(open);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media} />);
  fireEvent.click(await screen.findByRole("button", { name: "建立 GitHub Draft PR" }));
  await waitFor(() => expect(screen.getByRole("link", { name: /Draft PR #31/ })).toHaveAttribute("href", open.prUrl));
  expect(window.confirm).toHaveBeenCalled();
});

test("已合併前不提供finalize且沒有任何自動merge操作", async () => {
  mocks.fetch.mockResolvedValue({ ...publication, status: "open", prNumber: 31, prUrl: "https://github.com/yimi-Tian/yimi-story/pull/31" });
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media} />);
  expect((await screen.findAllByText("Draft PR 等待人工檢查")).length).toBe(2);
  expect(screen.queryByRole("button", { name: /合併/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /完成發布/ })).not.toBeInTheDocument();
});
