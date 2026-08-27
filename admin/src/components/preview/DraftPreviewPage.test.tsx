import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftPreviewPage, previewErrorKind } from "./DraftPreviewPage";

const mocks = vi.hoisted(() => ({ getPreviewSource: vi.fn() }));
const client = {};
vi.mock("../../lib/supabase", () => ({ getSupabaseClient: () => client }));
vi.mock("../../data/preview-repository", () => ({ getPreviewSource: mocks.getPreviewSource }));
beforeEach(() => mocks.getPreviewSource.mockReset());
afterEach(() => cleanup());

const publishedModel = {
  contentType: "class_result" as const, publicId: "CR-115-039", source: "published" as const, revision: null,
  draftStatus: null, validation: { valid: true, errors: [], warnings: [] }, cover: null, heroSource: null, gallery: [], unavailableDraftImages: 0,
  data: { id: "CR-115-039", year: 115, title: "成果名稱", className: "課程名稱", instructor: "講師", description: "說明",
    districts: ["民雄鄉"], venue: "場地", tags: [], sdgs: [], displayOrder: 39, publicNotes: null, coverAssetId: null, galleryAssetIds: [] },
};

test("direct preview route loads published fallback, refreshes, and returns to editor", async () => {
  mocks.getPreviewSource.mockResolvedValue(publishedModel);
  render(<MemoryRouter initialEntries={["/class-results/CR-115-039/preview"]}><Routes>
    <Route path="/class-results/:publicId/preview" element={<DraftPreviewPage type="class_result" />} />
    <Route path="/class-results/:publicId" element={<p>editor route</p>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByText("目前正式版本預覽")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "成果名稱" })).toBeInTheDocument();
  expect(mocks.getPreviewSource).toHaveBeenCalledWith({}, "class_result", "CR-115-039");
  fireEvent.click(screen.getByRole("button", { name: "重新整理預覽" }));
  await waitFor(() => expect(mocks.getPreviewSource).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("link", { name: "返回編輯" }));
  expect(await screen.findByText("editor route")).toBeInTheDocument();
});

test("missing public id is classified without exposing raw backend details", () => {
  expect(previewErrorKind(new Error("PREVIEW_NOT_FOUND"))).toBe("not_found");
  expect(previewErrorKind(new Error("PGRST116 raw detail"))).toBe("failed");
});
