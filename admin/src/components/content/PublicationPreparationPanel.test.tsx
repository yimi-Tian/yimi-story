import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PublicationPreparationPanel } from "./PublicationPreparationPanel";
import type { GitHubPublication } from "../../data/publication-repository";

const mocks=vi.hoisted(()=>({fetch:vi.fn(),timeline:vi.fn(),request:vi.fn(),fetchMedia:vi.fn(),requestMedia:vi.fn(),fetchGitHub:vi.fn(),requestGitHub:vi.fn(),finalizeGitHub:vi.fn()}));
vi.mock("../../data/publication-repository",()=>({fetchPublicationSnapshots:mocks.fetch,fetchPublicationTimeline:mocks.timeline,requestPublicationPreparation:mocks.request,fetchPublicationMediaPreparation:mocks.fetchMedia,requestPublicationMediaPreparation:mocks.requestMedia,fetchGitHubPublication:mocks.fetchGitHub,requestGitHubPublication:mocks.requestGitHub,finalizeGitHubPublication:mocks.finalizeGitHub}));
const client={} as never;
const base={client,contentId:"content-safe",draftId:"draft-safe",revision:4,draftStatus:"validated",blocked:false};
const preparation={valid:true,errors:[],warnings:[],validation:{revision:4,mediaCount:2,coverReady:true,exporterDeterministic:true},checksum:"a".repeat(64)};
const snapshot={id:"11111111-1111-4111-8111-111111111111",revision:4,schemaVersion:"1.1",checksum:"a".repeat(64),status:"ready",createdAt:"2026-08-28T00:00:00Z"};
const media={status:"ready",requiredCount:2,promotedCount:2,legacyCount:0,failedCount:0,manifestChecksum:"b".repeat(64),errorCode:null} as const;

afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.fetch.mockResolvedValue([]);mocks.timeline.mockResolvedValue({publishedSnapshot:null,entries:[]});mocks.fetchMedia.mockResolvedValue(null);mocks.fetchGitHub.mockResolvedValue(null);});

test("一般畫面使用六步中文發布流程且不顯示階段術語",async()=>{
  render(<PublicationPreparationPanel {...base}/>);
  for(const label of ["內容填寫","檢查並修正","預覽確認","準備發布","等待管理員確認","發布完成"])expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Stage 7/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Publication Snapshot/)).not.toBeInTheDocument();
});

test("準備發布會依序完成檢查、快照與圖片準備",async()=>{
  mocks.request.mockResolvedValueOnce({preparation}).mockResolvedValueOnce({preparation,snapshot});
  mocks.requestMedia.mockResolvedValue(media);
  render(<PublicationPreparationPanel {...base}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"準備發布"})).toBeEnabled());
  fireEvent.click(await screen.findByRole("button",{name:"準備發布"}));
  await waitFor(()=>expect(mocks.request).toHaveBeenNthCalledWith(1,client,"draft-safe",4,"validate"));
  expect(mocks.request).toHaveBeenNthCalledWith(2,client,"draft-safe",4,"create");
  expect(mocks.requestMedia).toHaveBeenCalledWith(client,snapshot.id);
  expect(await screen.findByText("發布資料已準備完成")).toBeInTheDocument();
});

test("檢查失敗時不建立快照或準備圖片",async()=>{
  mocks.request.mockResolvedValue({preparation:{...preparation,valid:false,errors:[{field:"title",code:"required",message:"title 為必填。"}]}});
  render(<PublicationPreparationPanel {...base}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"準備發布"})).toBeEnabled());
  fireEvent.click(await screen.findByRole("button",{name:"準備發布"}));
  expect(await screen.findByText("成果名稱")).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.requestMedia).not.toHaveBeenCalled();
});

test("未儲存變更會阻擋檢查與發布準備",async()=>{
  render(<PublicationPreparationPanel {...base} blocked/>);
  expect(await screen.findByRole("button",{name:"檢查內容"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"準備發布"})).toBeDisabled();
  expect(screen.getByText("請先儲存目前修改")).toBeInTheDocument();
});

test("既有新版快照與ready preparation會沿用且不重複準備",async()=>{
  mocks.fetch.mockResolvedValue([snapshot]);mocks.fetchMedia.mockResolvedValue(media);
  render(<PublicationPreparationPanel {...base}/>);
  expect(await screen.findByText("發布資料已準備完成")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"準備發布"})).toBeDisabled();
  expect(mocks.requestMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("進階資訊"));
  expect(screen.getAllByText("r4").length).toBeGreaterThan(0);
});

test("舊版資料不進入圖片準備，提供中文重新儲存提示",async()=>{
  mocks.fetch.mockResolvedValue([{...snapshot,schemaVersion:"1.0"}]);
  mocks.request.mockResolvedValue({preparation});
  render(<PublicationPreparationPanel {...base}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"準備發布"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"準備發布"}));
  expect(await screen.findByText(/此版本使用較舊的發布格式/)).toBeInTheDocument();
  expect(mocks.requestMedia).not.toHaveBeenCalled();
});

const version=(revision:number)=>({...snapshot,id:`snapshot-${revision}`,revision});
const entry=(revision:number,status:GitHubPublication["status"])=>({snapshot:version(revision),publication:{id:`publication-${revision}`,snapshotId:`snapshot-${revision}`,status,branch:"safe",baseSha:"b".repeat(40),commitSha:null,prNumber:1,prUrl:"https://github.com/yimi-Tian/yimi-story/pull/1",changedFiles:[],beforeCounts:null,afterCounts:null,checkedAt:null,errorCode:null}});
function history(rows:ReturnType<typeof entry>[],current:number|null){
  mocks.timeline.mockResolvedValue({publishedSnapshot:version(14),entries:rows});
  mocks.fetch.mockResolvedValue(current?[version(current)]:[]);mocks.fetchMedia.mockResolvedValue(media);
}

test("115-002 readonly mock：r14 finalized加ready只顯示已發布，不顯示尚未公開",async()=>{
  history([entry(14,"finalized")],14);
  render(<PublicationPreparationPanel {...base} contentId="115-002-readonly-mock" revision={14}/>);
  expect(await screen.findByText("目前正式版本 r14")).toBeInTheDocument();
  expect(screen.getAllByText("發布完成").length).toBeGreaterThan(1);
  expect(screen.queryByText(/尚未公開|等待管理員確認|^準備中$/)).not.toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalled();expect(mocks.requestGitHub).not.toHaveBeenCalled();expect(mocks.finalizeGitHub).not.toHaveBeenCalled();
});

test.each(["failed","cancelled"] as const)("目前publication %s不顯示等待確認並給出下一步",async(status)=>{
  history([entry(15,status),entry(14,"finalized")],15);
  render(<PublicationPreparationPanel {...base} revision={15}/>);
  await screen.findByText("目前正式版本 r14");
  expect(screen.queryByText("等待管理員確認")).not.toBeInTheDocument();
  expect(screen.getByText(/修改並儲存草稿/)).toBeInTheDocument();
});

test("published r14、draft r15：新準備可用，正式版本與歷史保留",async()=>{
  history([entry(14,"finalized")],null);
  render(<PublicationPreparationPanel {...base} revision={15}/>);
  expect(await screen.findByText("目前正式版本 r14")).toBeInTheDocument();
  expect(screen.getByText("最新草稿 r15")).toBeInTheDocument();expect(screen.getByText("有未發布變更")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"準備發布"})).toBeEnabled();expect(screen.getByText("發布歷史")).toBeInTheDocument();
});

test.each([15,16])("active r15、draft r%i：保留r14與active操作，阻擋並行新準備",async(revision)=>{
  history([entry(15,"open"),entry(14,"finalized")],revision===15?15:null);
  mocks.requestGitHub.mockResolvedValue(entry(15,"open").publication);
  render(<PublicationPreparationPanel {...base} revision={revision}/>);
  await screen.findByText("目前正式版本 r14");
  expect(screen.getAllByText("等待管理員確認").length).toBeGreaterThan(0);
  expect(screen.getByRole("button",{name:"準備發布"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"重新檢查發布狀態"}));
  await waitFor(()=>expect(mocks.requestGitHub).toHaveBeenCalledWith(client,"snapshot-15","refresh_status"));
});

test.each(["failed","cancelled"] as const)("舊%s r15、draft r16：保留正式版本並可開始新準備",async(status)=>{
  history([entry(15,status),entry(14,"finalized")],null);
  render(<PublicationPreparationPanel {...base} revision={16}/>);
  await screen.findByText("目前正式版本 r14");
  expect(screen.getByText("有未發布變更")).toBeInTheDocument();expect(screen.getByRole("button",{name:"準備發布"})).toBeEnabled();
  expect(screen.queryByText("等待管理員確認")).not.toBeInTheDocument();
});

test("revision前進與reload後active入口仍保留",async()=>{
  history([entry(15,"open"),entry(14,"finalized")],15);
  const view=render(<PublicationPreparationPanel {...base} revision={15}/>);
  await screen.findByText("目前正式版本 r14");
  mocks.fetch.mockResolvedValue([]);view.rerender(<PublicationPreparationPanel {...base} revision={16}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"重新檢查發布狀態"})).toBeEnabled());
  view.unmount();render(<PublicationPreparationPanel {...base} revision={16}/>);
  await screen.findByText("目前正式版本 r14");expect(screen.getByRole("button",{name:"準備發布"})).toBeDisabled();
});

test("publication history讀取失敗不開放發布操作",async()=>{
  mocks.timeline.mockRejectedValue(new Error("safe-read-error"));
  render(<PublicationPreparationPanel {...base}/>);
  await screen.findByText("無法讀取發布進度，請重新整理後再操作。");
  expect(screen.getByRole("button",{name:"準備發布"})).toBeDisabled();
  expect(screen.queryByRole("button",{name:"送出網站發布"})).not.toBeInTheDocument();
});
