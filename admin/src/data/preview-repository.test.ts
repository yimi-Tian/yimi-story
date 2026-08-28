import { expect, test } from "vitest";
import type { DraftMediaAsset } from "./media-repository";
import { buildPreviewModel } from "./preview-repository";

const classData = {
  id: "CR-115-039", year: 115, title: "正式標題", className: "課程", instructor: "講師",
  description: "內容", districts: ["民雄鄉"], venue: "場地", tags: ["地方"], sdgs: ["SDG 11"],
  displayOrder: 39, internalNotes: "SECRET-INTERNAL-NOTE-TEST", publicNotes: "公開備註",
  coverAssetId: "legacy-cover", galleryAssetIds: ["draft-two", "legacy-one"],
};
const media = (overrides: Partial<DraftMediaAsset>): DraftMediaAsset => ({
  id: "media", referenceId: "media", contentId: "content", draftId: null, source: "github_legacy", role: "gallery",
  legacyPath: "public/images/test.jpg", bucket: null, objectPath: null, originalFilename: "secret-filename.jpg",
  mimeType: "image/jpeg", byteSize: 1, width: 1, height: 1, checksumSha256: null, altText: "", containsPortrait: "unknown",
  rightsStatus: "unknown", originalMediaId:null,transformation:null,previewUrl: "https://example.test/image.jpg", ...overrides,
});

test("draft wins over published and public model excludes internal notes", () => {
  const model = buildPreviewModel({
    type: "class_result", publicId: "CR-115-039", publishedSnapshotId: "snapshot",
    draft: { revision: 4, status: "validated", data: { ...classData, title: "草稿標題" }, validation_result: { valid: true, errors: [], warnings: [] } },
    published: { snapshot_data: classData },
    media: [
      media({ referenceId: "legacy-cover", role: "cover", altText: "封面" }),
      media({ id: "draft-two", referenceId: "draft-two", source: "cms_draft", draftId: "draft", objectPath: "private/path", legacyPath: null, previewUrl: null }),
      media({ referenceId: "legacy-one", altText: "第一張" }),
    ],
  });
  expect(model.source).toBe("draft");
  expect(model.revision).toBe(4);
  if (model.contentType !== "class_result") throw new Error("expected class preview");
  expect(model.data.title).toBe("草稿標題");
  expect(model.gallery.map((item) => item.url)).toEqual([null, "https://example.test/image.jpg"]);
  expect(model.gallery[0].alt).toBe("成果圖片");
  expect(model.unavailableDraftImages).toBe(1);
  expect(JSON.stringify(model)).not.toContain("SECRET-INTERNAL-NOTE-TEST");
  expect(JSON.stringify(model)).not.toContain("private/path");
  expect(JSON.stringify(model)).not.toContain("secret-filename.jpg");
});

test("published snapshot is a no-revision fallback and missing cover stays absent", () => {
  const model = buildPreviewModel({ type: "class_result", publicId: "CR-115-039", publishedSnapshotId: "snapshot", draft: null,
    published: { snapshot_data: { ...classData, coverAssetId: null, galleryAssetIds: [] } }, media: [] });
  expect(model.source).toBe("published");
  expect(model.revision).toBeNull();
  expect(model.cover).toBeNull();
  expect(model.gallery).toEqual([]);
});

test("new unpublished draft is identified without pretending to be published", () => {
  const model = buildPreviewModel({ type: "class_result", publicId: "TEST-PREVIEW-CLASS", publishedSnapshotId: null,
    draft: { revision: 1, status: "draft", data: { ...classData, id: "TEST-PREVIEW-CLASS" }, validation_result: { valid: false, errors: [], warnings: [] } },
    published: null, media: [] });
  expect(model.source).toBe("new_draft");
  expect(model.revision).toBe(1);
});

test("112-015 keeps canonical cover null while display hero follows public legacy cover convention", () => {
  const canonical = {
    id: "112-015", year: 112, name: "諸羅「心」農法", startDate: null, endDate: null, dateLabel: "8/18、12/11",
    districts: ["鹿草鄉"], venue: "寶哥友酵農園、嘉義縣立圖書館", projectName: "公民素養計畫", activityType: "講座",
    topic: "環境教育", sdgs: ["SDG 2", "SDG 4", "SDG 12", "SDG 15"], summary: "活動摘要", participants: 46,
    partnerOrganizations: "寶哥友酵農園", leader: "許正寶", keywords: ["友善農業"], videoUrl: null, relatedUrl: null,
    featured: false, internalNotes: "", publicNotes: null, coverAssetId: null, galleryAssetIds: ["112-015:gallery:01", "112-015:gallery:02"],
  };
  const before = structuredClone(canonical);
  const mediaRows = [
    media({ referenceId: "112-015:gallery:01", previewUrl: "https://yimi-tian.github.io/yimi-story/public/images/activities/112-015/01.jpg", altText: "活動成果照片" }),
    media({ referenceId: "112-015:gallery:02", previewUrl: "https://yimi-tian.github.io/yimi-story/public/images/activities/112-015/02.jpg", altText: "活動成果照片" }),
  ];
  const mediaBefore = structuredClone(mediaRows);
  const model = buildPreviewModel({ type: "activity", publicId: "112-015", publishedSnapshotId: "snapshot", draft: null,
    published: { snapshot_data: canonical }, media: mediaRows });
  expect(model.contentType).toBe("activity");
  expect(model.data.coverAssetId).toBeNull();
  expect(model.heroSource).toBe("legacy_convention");
  expect(model.cover?.url).toBe("https://yimi-tian.github.io/yimi-story/public/images/activities/112-015/cover.jpg");
  expect(model.cover?.fallbackUrl).toBe(model.gallery[0].url);
  expect(model.gallery[0].url).toContain("/112-015/01.jpg");
  expect(canonical).toEqual(before);
  expect(mediaRows).toEqual(mediaBefore);
});

test("new draft without explicit cover may use first gallery image only as display fallback", () => {
  const data = { ...classData, id: "TEST-PREVIEW-CLASS", coverAssetId: null, galleryAssetIds: ["legacy-one"] };
  const model = buildPreviewModel({ type: "class_result", publicId: data.id, publishedSnapshotId: null,
    draft: { revision: 1, status: "draft", data, validation_result: { valid: false, errors: [], warnings: [] } }, published: null,
    media: [media({ referenceId: "legacy-one" })] });
  expect(model.data.coverAssetId).toBeNull();
  expect(model.heroSource).toBe("gallery_fallback");
  expect(model.cover?.url).toBe(model.gallery[0].url);
});
