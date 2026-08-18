import test from "node:test";
import assert from "node:assert/strict";
import { exportClassResults } from "../../tools/export-class-results.mjs";

const settings = { allowedDistricts: ["朴子市"], allowedExternalImageHosts: [] };

function record() {
  return {
    schemaVersion: "1.0",
    contentType: "class_result",
    status: "approved",
    data: {
      id: "CR-116-001",
      year: 116,
      title: "地方木作班花絮與成果",
      className: "地方木作班",
      instructor: "測試老師",
      description: "這是一段符合最小長度的班級課程介紹，用來驗證資料契約是否正確。",
      districts: ["朴子市"],
      venue: "測試教室",
      tags: ["木作"],
      sdgs: ["SDG 4"],
      displayOrder: 1,
      internalNotes: "不得公開的內部備註",
      publicNotes: null,
      coverAssetId: "cover-1",
      galleryAssetIds: ["gallery-1"],
    },
    media: [
      { id: "cover-1", role: "cover", sortOrder: 0, url: "public/images/class-results/CR-116-001/cover.jpg", altText: "封面替代文字", source: "github_legacy" },
      { id: "gallery-1", role: "gallery", sortOrder: 1, url: "public/images/class-results/CR-116-001/01.jpg", altText: "相簿替代文字", source: "github_legacy" },
    ],
  };
}

test("班級 exporter 穩定、欄位順序固定且不輸出 internalNotes", async () => {
  const first = await exportClassResults([record()], { settings });
  const second = await exportClassResults([record()], { settings });
  assert.equal(first.jsonText, second.jsonText);
  assert.equal(first.fallbackText, second.fallbackText);
  assert.equal(first.jsonText.includes("internalNotes"), false);
  assert.equal(first.published[0].publicationStatus, "approved");
  assert.equal(first.published[0].coverImage, "public/images/class-results/CR-116-001/cover.jpg");
});
