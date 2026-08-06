import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { parseCsv } from "../../tools/content/csv.mjs";
import { exportActivities } from "../../tools/export-activities.mjs";

const settings = { allowedDistricts: ["朴子市"], allowedExternalImageHosts: [] };

function record() {
  return {
    schemaVersion: "1.0",
    contentType: "activity",
    status: "approved",
    data: {
      id: "116-001",
      year: 116,
      name: "地方文化，學習活動",
      startDate: "2027-12-31",
      endDate: "2028-01-01",
      dateLabel: "不應使用",
      districts: ["朴子市"],
      venue: "測試場地",
      projectName: null,
      activityType: "講座",
      topic: "地方文化",
      sdgs: ["SDG 4", "SDG 11"],
      summary: "摘要含有「雙引號」、逗號，並且\n保留正常換行以測試 RFC 4180 輸出。",
      participants: 20,
      partnerOrganizations: null,
      leader: null,
      keywords: ["地方", "文化"],
      videoUrl: null,
      relatedUrl: null,
      featured: false,
      internalNotes: "不得公開的內部備註",
      publicNotes: "可公開備註",
      coverAssetId: "cover-1",
      galleryAssetIds: [],
    },
    media: [
      { id: "cover-1", role: "cover", sortOrder: 0, url: "/images/activities/116-001/cover.jpg", altText: "活動封面", source: "github_legacy" },
    ],
  };
}

test("活動 exporter 支援 CSV 逗號、引號、換行與跨年度日期", async () => {
  const output = await exportActivities([record()], { settings });
  const parsed = parseCsv(output.csvText);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]["活動名稱"], "地方文化，學習活動");
  assert.equal(parsed[0]["活動日期"], "2027/12/31～2028/1/1");
  assert.equal(parsed[0]["活動效益摘要"], record().data.summary);
  assert.equal(parsed[0]["備註"], "可公開備註");
  assert.equal(output.csvText.includes("不得公開的內部備註"), false);
});

test("活動 exporter 與 static fallback deterministic 且語意一致", async () => {
  const first = await exportActivities([record()], { settings });
  const second = await exportActivities([record()], { settings });
  assert.equal(first.csvText, second.csvText);
  assert.equal(first.fallbackText, second.fallbackText);
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(first.fallbackText, context);
  assert.equal(context.window.ACTIVITIES_CSV, first.csvText);
});
