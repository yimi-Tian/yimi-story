import test from "node:test";
import assert from "node:assert/strict";
import { projectActivityPublicData, projectClassResultPublicData, safePublicHttpsUrl } from "./public-projection.mjs";

test("class public projection keeps public fields and removes internalNotes", () => {
  const projected = projectClassResultPublicData({
    id: "TEST-CLASS", year: 115, title: "成果", className: "課程", instructor: "講師",
    description: "內容", districts: ["民雄鄉"], venue: "場地", tags: ["地方"], sdgs: ["SDG 11"],
    displayOrder: 1, internalNotes: "SECRET-INTERNAL-NOTE-TEST", publicNotes: "公開備註",
    coverAssetId: "cover", galleryAssetIds: ["gallery"],
  });
  assert.equal("internalNotes" in projected, false);
  assert.equal(JSON.stringify(projected).includes("SECRET-INTERNAL-NOTE-TEST"), false);
  assert.equal(projected.publicNotes, "公開備註");
  assert.deepEqual(projected.galleryAssetIds, ["gallery"]);
});

test("activity public projection preserves legacy dateLabel and removes internalNotes", () => {
  const projected = projectActivityPublicData({
    id: "TEST-ACTIVITY", year: 112, name: "活動", startDate: null, endDate: null, dateLabel: "112年春季",
    districts: ["水上鄉"], venue: "場地", projectName: null, activityType: "成果", topic: "地方",
    sdgs: ["SDG 4"], summary: "摘要", participants: 20, partnerOrganizations: null, leader: "講師",
    keywords: ["學習"], videoUrl: "javascript:alert(1)", relatedUrl: "https://example.test/path",
    featured: false, internalNotes: "SECRET-INTERNAL-NOTE-TEST", publicNotes: "公開備註",
    coverAssetId: null, galleryAssetIds: [],
  });
  assert.equal(projected.dateLabel, "112年春季");
  assert.equal(projected.startDate, null);
  assert.equal(projected.videoUrl, null);
  assert.equal(projected.relatedUrl, "https://example.test/path");
  assert.equal("internalNotes" in projected, false);
  assert.equal(JSON.stringify(projected).includes("SECRET-INTERNAL-NOTE-TEST"), false);
});

test("public links accept HTTPS only", () => {
  assert.equal(safePublicHttpsUrl("https://example.test/a"), "https://example.test/a");
  for (const value of ["http://example.test", "javascript:alert(1)", "data:text/plain,x", "file:///tmp/x", "bad-url"]) {
    assert.equal(safePublicHttpsUrl(value), null);
  }
});
