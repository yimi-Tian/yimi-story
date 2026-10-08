import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ContentEditorBoundary } from "./ContentEditorBoundary";
import { ContentEditorPage } from "./ContentEditorPage";
import { ContentListPage } from "./ContentListPage";

const mocks = vi.hoisted(() => ({
  openContentDraft: vi.fn(),
  fetchContentList: vi.fn(),
  fetchPublicationSnapshots: vi.fn().mockResolvedValue([]),
  saveContentDraft: vi.fn(),
  getOrCreateWalkingIdentity: vi.fn(),
  client: {},
}));

vi.mock("../../lib/supabase", () => ({ getSupabaseClient: () => mocks.client }));
vi.mock("../../data/content-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../data/content-repository")>();
  return { ...original, openContentDraft: mocks.openContentDraft, fetchContentList: mocks.fetchContentList, saveContentDraft: mocks.saveContentDraft, getOrCreateWalkingIdentity: mocks.getOrCreateWalkingIdentity };
});
vi.mock("../../data/publication-repository", () => ({
  fetchPublicationSnapshots: mocks.fetchPublicationSnapshots,
  fetchPublicationTimeline: vi.fn().mockResolvedValue({publishedSnapshot:null,entries:[]}),
  requestPublicationPreparation: vi.fn(),
}));

test("BrowserRouter 相容 route 可解析 existing class publicId 並顯示編輯表單", async () => {
  mocks.openContentDraft.mockResolvedValue({
    contentId: "content-test",
    contentType: "class_result",
    publicId: "CR-115-056",
    publishedSnapshotId: "snapshot-test",
    publishedAt: "2026-01-01T00:00:00Z",
    draftId: "draft-test",
    draftStatus: "draft",
    revision: 1,
    updatedAt: "2026-01-01T00:00:00Z",
    mediaCount: 2,
    validationResult: { valid: false, errors: [], warnings: [] },
    data: {
      id: "CR-115-056", year: 115, title: "測試班級", className: "測試課程",
      instructor: "測試講師", description: "成果內容", districts: ["水上鄉"], venue: "測試場地",
      tags: [], sdgs: [], displayOrder: 56, publicNotes: null, internalNotes: "",
      coverAssetId: null, galleryAssetIds: [],
    },
  });

  render(<MemoryRouter initialEntries={["/class-results/CR-115-056"]}>
    <Routes><Route path="/class-results/:publicId" element={
      <ContentEditorBoundary type="class_result"><ContentEditorPage type="class_result" /></ContentEditorBoundary>
    } /></Routes>
  </MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "測試班級" })).toBeInTheDocument();
  await waitFor(() => expect(mocks.openContentDraft).toHaveBeenCalledWith({}, "class_result", "CR-115-056"));
  expect(screen.getByLabelText(/內部備註/)).toBeInTheDocument();
  expect(screen.queryByText("後台暫時無法載入")).not.toBeInTheDocument();
});
afterEach(() => cleanup());

test.each([false, true])("existing class r0/r1 Editor and list compare canonical, changed=%s (mock read only)", async (changed) => {
  const baseline = { id: "CR-115-001", year: 115, title: "既有班級", className: "課程", instructor: "講師", description: "成果",
    districts: ["水上鄉"], venue: "場地", tags: [], sdgs: [], displayOrder: 1, publicNotes: null, internalNotes: null, coverAssetId: null, galleryAssetIds: [] };
  const record = { contentId: "mock-content", contentType: "class_result", publicId: baseline.id, publishedSnapshotId: "mock-baseline",
    publishedAt: "2026-01-01T00:00:00Z", publishedRevision: 0, draftId: "mock-draft", draftStatus: "draft", revision: 1,
    updatedAt: "2026-09-04T00:00:00Z", mediaCount: 0, validationResult: { valid: true, errors: [], warnings: [] },
    publishedData: baseline, data: { ...baseline, title: changed ? "修改成果" : baseline.title, internalNotes: "內部筆記", revision: 1 } };
  const before = JSON.stringify(record);
  mocks.openContentDraft.mockResolvedValue(record);
  mocks.fetchContentList.mockResolvedValue([record]);
  const editor = render(<MemoryRouter initialEntries={["/class-results/CR-115-001"]}><Routes>
    <Route path="/class-results/:publicId" element={<ContentEditorPage type="class_result" />} />
  </Routes></MemoryRouter>);
  expect((await screen.findAllByText(changed ? "已發布・有未發布修改" : "內容已同步")).length).toBeGreaterThan(0);
  if (!changed) expect(screen.queryByText("有未發布變更")).not.toBeInTheDocument();
  editor.unmount();
  render(<MemoryRouter><ContentListPage type="class_result" /></MemoryRouter>);
  const badge = await screen.findByText(changed ? "已發布・有未發布修改" : "已發布", { selector: "span.record-status" });
  expect(badge.classList.contains("has-draft")).toBe(changed);
  expect(JSON.stringify(record)).toBe(before);
});

test("新班級尚無draft與snapshot時 Editor 正常載入", async () => {
  render(<MemoryRouter initialEntries={["/class-results/new"]}><Routes>
    <Route path="/class-results/new" element={<ContentEditorBoundary type="class_result"><ContentEditorPage type="class_result" isNew /></ContentEditorBoundary>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "新增班級花絮" })).toBeInTheDocument();
  expect(screen.getByText(/請先儲存文字草稿/)).toBeInTheDocument();
  expect(screen.queryByText("後台暫時無法載入")).not.toBeInTheDocument();
  expect(mocks.fetchPublicationSnapshots).not.toHaveBeenCalled();
});

test("dirty form refuses to preview an older saved draft", async () => {
  const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
  mocks.openContentDraft.mockResolvedValue({
    contentId: "content-test", contentType: "class_result", publicId: "CR-115-056",
    publishedSnapshotId: "snapshot-test", publishedAt: "2026-01-01T00:00:00Z",
    draftId: "draft-test", draftStatus: "draft", revision: 1, updatedAt: "2026-01-01T00:00:00Z", mediaCount: 0,
    validationResult: { valid: false, errors: [], warnings: [] },
    data: { id: "CR-115-056", year: 115, title: "測試班級", className: "測試課程", instructor: "測試講師",
      description: "成果內容", districts: ["水上鄉"], venue: "測試場地", tags: [], sdgs: [], displayOrder: 56,
      publicNotes: null, internalNotes: "", coverAssetId: null, galleryAssetIds: [] },
  });
  const rendered = render(<MemoryRouter initialEntries={["/class-results/CR-115-056"]}><Routes>
    <Route path="/class-results/:publicId" element={<ContentEditorPage type="class_result" />} />
    <Route path="/class-results/:publicId/preview" element={<p>preview route</p>} />
  </Routes></MemoryRouter>);
  fireEvent.change(await within(rendered.container).findByLabelText(/成果名稱/), { target: { value: "尚未儲存" } });
  fireEvent.click(within(rendered.container).getByRole("button", { name: "預覽" }));
  expect(alert).toHaveBeenCalledWith("目前有尚未儲存的變更，請先儲存草稿後再預覽。");
  expect(screen.queryByText("preview route")).not.toBeInTheDocument();
  alert.mockRestore();
});

test("活動欄位、驗證摘要與 inline error 統一顯示參與人次", async () => {
  mocks.openContentDraft.mockResolvedValue({
    contentId: "activity-content", contentType: "activity", publicId: "115-002",
    publishedSnapshotId: "activity-snapshot", publishedAt: "2026-09-03T00:00:00Z",
    draftId: "activity-draft", draftStatus: "draft", revision: 1, updatedAt: "2026-09-03T00:00:00Z", mediaCount: 0,
    validationResult: { valid: false, errors: [{field:"participants",code:"participants.range",message:"請輸入 0 到 1,000,000 的整數。"}], warnings: [] },
    data: { id: "115-002", year: 115, name: "測試活動", startDate: null, endDate: null, dateLabel: "8/1",
      districts: ["東石鄉"], venue: "測試場地", projectName: null, activityType: "工作坊", topic: "地方文化",
      sdgs: ["SDG 4"], summary: "這是一段足夠長度的活動成果摘要，用來驗證欄位名稱。", participants: 20,
      partnerOrganizations: null, leader: null, keywords: [], videoUrl: null, relatedUrl: null, featured: false,
      publicNotes: null, internalNotes: null, coverAssetId: null, galleryAssetIds: [] },
  });
  const rendered = render(<MemoryRouter initialEntries={["/activities/115-002"]}><Routes>
    <Route path="/activities/:publicId" element={<ContentEditorPage type="activity" />} />
  </Routes></MemoryRouter>);
  const field = await within(rendered.container).findByLabelText(/參與人次/);
  expect(screen.getByText("請填本活動累計參與人次。")).toBeInTheDocument();
  expect(screen.queryByText("參與人數")).not.toBeInTheDocument();
  expect(screen.queryByText("參加人數")).not.toBeInTheDocument();
  await waitFor(()=>expect(field).toHaveAttribute("aria-invalid", "true"));
  expect(screen.getAllByText("參與人次").length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText("請輸入 0 到 1,000,000 的整數。")).toHaveClass("field-error");
  const summaryLink=screen.getByRole("button",{name:"參與人次：請輸入 0 到 1,000,000 的整數。"});
  expect(summaryLink).toBeInTheDocument();
  expect(field).toHaveAttribute("aria-describedby","field-participants-error");
  fireEvent.click(summaryLink);
  await waitFor(()=>expect(field).toHaveFocus());
  expect(rendered.container.textContent).not.toContain("participants");
});

test("活動列表 participants 欄位標題顯示參與人次", async () => {
  mocks.fetchContentList.mockResolvedValue([]);
  render(<MemoryRouter><ContentListPage type="activity" /></MemoryRouter>);
  expect(await screen.findByRole("columnheader", { name: "參與人次" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "人數" })).not.toBeInTheDocument();
});

const walkingActivityRecord = () => ({
  contentId: "walking-content", contentType: "activity" as const, publicId: "115-099", publishedSnapshotId: "snapshot", publishedAt: "2026-01-01T00:00:00Z",
  publishedRevision: 0, draftId: "walking-draft", draftStatus: "draft" as const, revision: 1, updatedAt: "2026-01-01T00:00:00Z", mediaCount: 0,
  walkingRecordId: null, validationResult: { valid: true, errors: [], warnings: [] },
  data: { id: "115-099", year: 115, name: "走讀活動", startDate: null, endDate: null, dateLabel: "10/6", districts: ["中埔鄉"], venue: "場地",
    projectName: null, activityType: "走讀", topic: "地方文化", sdgs: [], summary: "這是一段足夠長度的活動成果摘要，用來測試走讀草稿儲存。", participants: 20,
    partnerOrganizations: null, leader: null, keywords: [], videoUrl: null, relatedUrl: null, featured: false, publicNotes: null, internalNotes: null,
    coverAssetId: null, galleryAssetIds: [], walkingRecord: null },
});

test("first successful walking save allocates identity after canonical draft save", async () => {
  mocks.openContentDraft.mockResolvedValue(walkingActivityRecord());
  mocks.saveContentDraft.mockResolvedValue({ revision: 2, status: "validated", updatedAt: "2026-10-06T00:00:00Z" });
  mocks.getOrCreateWalkingIdentity.mockResolvedValue("WR-115-001");
  render(<MemoryRouter initialEntries={["/activities/115-099"]}><Routes><Route path="/activities/:publicId" element={<ContentEditorPage type="activity" />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("checkbox", { name: /建立走讀與田野紀錄/ }));
  fireEvent.change(screen.getByLabelText(/走讀摘要/), { target: { value: "這是一段足夠長度的走讀摘要內容，用來測試首次儲存。" } });
  fireEvent.change(screen.getByLabelText(/走讀範圍摘要/), { target: { value: "中埔聚落" } });
  fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
  await waitFor(() => expect(mocks.saveContentDraft).toHaveBeenCalled());
  expect(mocks.saveContentDraft.mock.calls.at(-1)?.[2]).toMatchObject({ walkingRecord: { summary: "這是一段足夠長度的走讀摘要內容，用來測試首次儲存。", routeSummary: "中埔聚落" } });
  await waitFor(() => expect(mocks.getOrCreateWalkingIdentity).toHaveBeenCalledWith({}, "walking-content"));
  expect(screen.queryByText(/Walking Record ID 建立失敗/)).not.toBeInTheDocument();
});

test("identity failure is not presented as a completed walking save", async () => {
  mocks.openContentDraft.mockResolvedValue(walkingActivityRecord());
  mocks.saveContentDraft.mockResolvedValue({ revision: 2, status: "validated", updatedAt: "2026-10-06T00:00:00Z" });
  mocks.getOrCreateWalkingIdentity.mockRejectedValue(new Error("WALKING_IDENTITY_CREATE_FAILED"));
  render(<MemoryRouter initialEntries={["/activities/115-099"]}><Routes><Route path="/activities/:publicId" element={<ContentEditorPage type="activity" />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("checkbox", { name: /建立走讀與田野紀錄/ }));
  fireEvent.change(screen.getByLabelText(/走讀摘要/), { target: { value: "這是一段足夠長度的走讀摘要內容，用來測試失敗狀態。" } });
  fireEvent.change(screen.getByLabelText(/走讀範圍摘要/), { target: { value: "中埔聚落" } });
  fireEvent.click(screen.getByRole("button", { name: "儲存草稿" }));
  expect(await screen.findByText(/活動草稿已儲存，但 Walking Record ID 建立失敗/)).toBeInTheDocument();
  expect(screen.getAllByText("有尚未儲存的變更").length).toBeGreaterThan(0);
});

test("reload recognizes a saved walking draft with missing identity and does not allocate on read", async () => {
  const record = walkingActivityRecord(); record.data = { ...record.data, walkingRecord: { type: "地方走讀", titleOverride: null, locationOverride: null, summary: "這是一段足夠長度的走讀摘要內容，用來測試重新整理。", routeSummary: "中埔聚落", stops: [], fieldNotes: [], digitalWalkId: null, coverAssetId: null } } as never;
  mocks.openContentDraft.mockResolvedValue(record);
  render(<MemoryRouter initialEntries={["/activities/115-099"]}><Routes><Route path="/activities/:publicId" element={<ContentEditorPage type="activity" />} /></Routes></MemoryRouter>);
  expect(await screen.findByText("Walking Record ID 尚未建立")).toBeInTheDocument();
  expect(mocks.getOrCreateWalkingIdentity).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "檢查內容" })).toBeDisabled();
});

test("retry after identity failure calls idempotent allocator again and clears failure", async () => {
  mocks.openContentDraft.mockResolvedValue(walkingActivityRecord()); mocks.saveContentDraft.mockResolvedValue({ revision: 2, status: "validated", updatedAt: "2026-10-06T00:00:00Z" }); mocks.getOrCreateWalkingIdentity.mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce("WR-115-001");
  render(<MemoryRouter initialEntries={["/activities/115-099"]}><Routes><Route path="/activities/:publicId" element={<ContentEditorPage type="activity" />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("checkbox", { name: /建立走讀與田野紀錄/ })); fireEvent.change(screen.getByLabelText(/走讀摘要/), { target: { value: "這是一段足夠長度的走讀摘要內容，用來測試重試配置。" } }); fireEvent.change(screen.getByLabelText(/走讀範圍摘要/), { target: { value: "中埔聚落" } });
  fireEvent.click(screen.getByRole("button", { name: "儲存草稿" })); await screen.findByText(/Walking Record ID 建立失敗/);
  await waitFor(() => expect(screen.getByRole("button", { name: "儲存草稿" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "儲存草稿" })); await waitFor(() => expect(mocks.getOrCreateWalkingIdentity).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.queryByText(/Walking Record ID 建立失敗/)).not.toBeInTheDocument());
});
