import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GitHubPublicationPanel } from "./GitHubPublicationPanel";

const mocks=vi.hoisted(()=>({fetch:vi.fn(),request:vi.fn(),finalize:vi.fn()}));
vi.mock("../../data/publication-repository",()=>({fetchGitHubPublication:mocks.fetch,requestGitHubPublication:mocks.request,finalizeGitHubPublication:mocks.finalize}));
const client={} as never;
const snapshot={id:"11111111-1111-4111-8111-111111111111",revision:7,schemaVersion:"1.1",checksum:"a".repeat(64),status:"ready",createdAt:"2026-09-02T00:00:00Z"};
const media={status:"ready",requiredCount:3,promotedCount:3,legacyCount:0,failedCount:0,manifestChecksum:"b".repeat(64),errorCode:null} as const;
const publication={id:"safe",snapshotId:snapshot.id,status:"dry_run_ready",branch:"publication/class-result/CR-115-057/aaaaaaaaaaaa",baseSha:"c".repeat(40),commitSha:null,prNumber:null,prUrl:null,changedFiles:["data/class-results.json","data/class-results-data.js"],beforeCounts:{classResults:56,activities:63},afterCounts:{classResults:57,activities:63},checkedAt:null,errorCode:null} as const;

afterEach(()=>{cleanup();vi.restoreAllMocks();});
beforeEach(()=>{mocks.fetch.mockReset();mocks.request.mockReset();mocks.finalize.mockReset();mocks.fetch.mockResolvedValue(null);});

test("尚未準備好時送出按鈕保持停用",()=>{
  const{rerender}=render(<GitHubPublicationPanel client={client} snapshot={null} mediaPreparation={null}/>);
  expect(screen.getByRole("button",{name:"送出網站發布"})).toBeDisabled();
  rerender(<GitHubPublicationPanel client={client} snapshot={{...snapshot,schemaVersion:"1.0"}} mediaPreparation={media}/>);
  expect(screen.getByRole("button",{name:"送出網站發布"})).toBeDisabled();
});

test("單一送出動作先dry run再建立待人工確認更新",async()=>{
  const open={...publication,status:"open",prNumber:31,prUrl:"https://github.com/yimi-Tian/yimi-story/pull/31"} as const;
  mocks.request.mockResolvedValueOnce(publication).mockResolvedValueOnce(open);
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media}/>);
  fireEvent.click(await screen.findByRole("button",{name:"送出網站發布"}));
  await waitFor(()=>expect(mocks.request).toHaveBeenNthCalledWith(1,client,snapshot.id,"dry_run"));
  expect(mocks.request).toHaveBeenNthCalledWith(2,client,snapshot.id,"create_draft_pr");
  expect((await screen.findAllByText("等待管理員確認")).length).toBeGreaterThan(0);
  expect(confirm).toHaveBeenCalledWith("送出後將建立網站發布草稿，並等待管理員確認後才會公開。");
});

test("等待確認狀態不提供自動合併或完成發布",async()=>{
  mocks.fetch.mockResolvedValue({...publication,status:"open",prNumber:31,prUrl:"https://github.com/yimi-Tian/yimi-story/pull/31"});
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media}/>);
  expect((await screen.findAllByText("等待管理員確認")).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button",{name:/合併/})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:/確認公開並完成發布/})).not.toBeInTheDocument();
  expect(screen.getByText("前往 GitHub 檢查")).toBeInTheDocument();
});

test("完成後以正式版本中文狀態呈現",async()=>{
  mocks.fetch.mockResolvedValue({...publication,status:"finalized"});
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media} currentRevision={7}/>);
  expect((await screen.findAllByText("發布完成")).length).toBeGreaterThan(0);
  expect(screen.getByText("正式版本 r7")).toBeInTheDocument();
});

test("未儲存時所有發布動作均停用，即使圖片已準備完成",async()=>{
  mocks.fetch.mockResolvedValue(publication);
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media} blocked/>);
  await screen.findAllByText("發布內容已檢查");
  expect(screen.getByRole("button",{name:"送出網站發布"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"取消本次發布"})).toBeDisabled();
  expect(mocks.request).not.toHaveBeenCalled();
});

test("重新載入已檢查發布可重試建立，不重複dry run",async()=>{
  mocks.fetch.mockResolvedValue(publication);
  mocks.request.mockResolvedValue({...publication,status:"open"});
  vi.spyOn(window,"confirm").mockReturnValue(true);
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media}/>);
  await screen.findAllByText("發布內容已檢查");
  fireEvent.click(screen.getByRole("button",{name:"送出網站發布"}));
  await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith(client,snapshot.id,"create_draft_pr"));
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

test("取消發布仍須明確確認，正式版本不取最新草稿revision",async()=>{
  mocks.fetch.mockResolvedValue({...publication,status:"open"});
  vi.spyOn(window,"confirm").mockReturnValue(false);
  const view=render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media}/>);
  fireEvent.click(await screen.findByRole("button",{name:"取消本次發布"}));
  expect(mocks.request).not.toHaveBeenCalled();
  view.unmount();
  mocks.fetch.mockResolvedValue({...publication,status:"finalized",finalizedAt:"2026-09-03T00:00:00Z"});
  render(<GitHubPublicationPanel client={client} snapshot={snapshot} mediaPreparation={media} currentRevision={9}/>);
  expect(await screen.findByText("正式版本 r7")).toBeInTheDocument();
  expect(screen.queryByText("正式版本 r9")).not.toBeInTheDocument();
  expect(screen.getByText(/發布完成時間/)).toBeInTheDocument();
});
