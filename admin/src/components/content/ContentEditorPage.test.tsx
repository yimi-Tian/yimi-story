import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ContentEditorBoundary } from "./ContentEditorBoundary";
import { ContentEditorPage } from "./ContentEditorPage";

const mocks = vi.hoisted(() => ({
  openContentDraft: vi.fn(),
  fetchPublicationSnapshots: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../lib/supabase", () => ({ getSupabaseClient: () => ({}) }));
vi.mock("../../data/content-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../data/content-repository")>();
  return { ...original, openContentDraft: mocks.openContentDraft };
});
vi.mock("../../data/publication-repository", () => ({
  fetchPublicationSnapshots: mocks.fetchPublicationSnapshots,
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
  fireEvent.change(await within(rendered.container).findByLabelText(/標題/), { target: { value: "尚未儲存" } });
  fireEvent.click(within(rendered.container).getByRole("button", { name: "預覽" }));
  expect(alert).toHaveBeenCalledWith("目前有尚未儲存的變更，請先儲存草稿後再預覽。");
  expect(screen.queryByText("preview route")).not.toBeInTheDocument();
  alert.mockRestore();
});
