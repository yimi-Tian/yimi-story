import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { DraftPreviewModel } from "../../preview/preview-model";
import { PreviewStatusPanel } from "./PreviewStatusPanel";
import { PublicPreview } from "./PublicPreview";
afterEach(() => cleanup());

const model: DraftPreviewModel = {
  contentType: "activity", publicId: "112-015", source: "draft", revision: 3, draftStatus: "validated",
  validation: { valid: false, errors: [{ field: "name", code: "required", message: "必填" }], warnings: [{ field: "media", code: "alt", message: "提醒" }] },
  unavailableDraftImages: 1, cover: null, heroSource: null,
  gallery: [{ url: "https://example.test/image.jpg", alt: "活動圖片" }],
  data: {
    id: "112-015", year: 112, name: "<script>alert(1)</script>", startDate: null, endDate: null, dateLabel: "112年春季",
    districts: ["水上鄉"], venue: "場地", projectName: null, activityType: "成果", topic: "地方", sdgs: [],
    summary: "<img src=x onerror=alert(1)>", participants: 20, partnerOrganizations: null, leader: null, keywords: [],
    videoUrl: null, relatedUrl: null, featured: false, publicNotes: "公開備註", coverAssetId: null, galleryAssetIds: ["image"],
  },
};

test("preview renders editable text safely and keeps admin status outside public content", () => {
  const { container } = render(<><PreviewStatusPanel model={model} /><PublicPreview model={model} /></>);
  expect(screen.getByText("草稿預覽")).toBeInTheDocument();
  expect(screen.getByText("尚未發布")).toBeInTheDocument();
  expect(screen.getByText("草稿版本 r3")).toBeInTheDocument();
  expect(screen.getByText("目前有 1 項錯誤，尚不適合發布。")).toBeInTheDocument();
  expect(screen.getByText("目前有 1 項提醒。")).toBeInTheDocument();
  expect(screen.getByText("1 張草稿圖片暫時無法預覽。")).toBeInTheDocument();
  expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(screen.getAllByText("公開備註")).toHaveLength(2);
  expect(screen.getByText("參與人次")).toBeInTheDocument();
  expect(screen.getByText("20 人次")).toBeInTheDocument();
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img[src='x']")).toBeNull();
  expect(container.querySelector(".public-preview")?.textContent).not.toContain("112-015");
});

test("failed image is isolated behind a safe fallback", () => {
  const rendered = render(<PublicPreview model={model} />);
  fireEvent.error(within(rendered.container).getByRole("img", { name: "活動圖片" }));
  expect(within(rendered.container).getByText("圖片暫時無法預覽")).toBeInTheDocument();
});

test("admin draft preview shows Walking effective title, fields and cover source indication", () => {
  const walkingModel: DraftPreviewModel = { ...model, contentType: "activity", walkingCover: { url: "https://example.test/walking.jpg", alt: "走讀圖片" }, walkingRecord: {
    type: "聚落踏查", titleOverride: "聚落踏查紀錄", locationOverride: "三界埔、鹽館", summary: "這是一段足夠長度的走讀摘要內容，供預覽顯示。", routeSummary: "灣潭聚落",
    stops: [{ name: "第一站", note: "站點說明" }], fieldNotes: ["觀察重點"], digitalWalkId: "DW-WT-001", coverAssetId: "image",
  }, walkingLocation: "三界埔、鹽館" };
  render(<PublicPreview model={walkingModel} />);
  expect(screen.getByRole("heading", { name: "聚落踏查紀錄" })).toBeInTheDocument();
  expect(screen.getByText("聚落踏查")).toBeInTheDocument();
  expect(screen.getByText("灣潭聚落")).toBeInTheDocument();
  expect(screen.getByText("三界埔、鹽館")).toBeInTheDocument();
  expect(screen.getByText("第一站")).toBeInTheDocument();
  expect(screen.getByText("觀察重點")).toBeInTheDocument();
  expect(screen.getByText("走讀封面：使用本活動既有圖片")).toBeInTheDocument();
});
