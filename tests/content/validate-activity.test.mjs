import test from "node:test";
import assert from "node:assert/strict";
import { validateActivity } from "../../tools/content/validate-activity.mjs";
import { validateImageReference } from "../../tools/content/validate-image-url.mjs";

const settings = { allowedDistricts: ["朴子市"], allowedExternalImageHosts: [] };

function validActivity() {
  return {
    id: "116-001",
    year: 116,
    name: "地方文化學習活動",
    startDate: "2027-08-06",
    endDate: null,
    dateLabel: "8/6",
    districts: ["朴子市"],
    venue: "測試場地",
    projectName: null,
    activityType: "講座",
    topic: "地方文化",
    sdgs: ["SDG 4"],
    summary: "這是一段符合最小長度的活動效益摘要，用來驗證活動資料的完整性。",
    participants: 20,
    partnerOrganizations: null,
    leader: null,
    keywords: [],
    videoUrl: null,
    relatedUrl: null,
    featured: false,
    internalNotes: null,
    publicNotes: null,
    coverAssetId: "cover-1",
    galleryAssetIds: [],
  };
}

test("活動 ID 年度必須與 year 一致", () => {
  const data = validActivity();
  data.year = 115;
  assert.ok(validateActivity(data, { settings }).errors.some((issue) => issue.code === "year.idMismatch"));
});

test("endDate 不得早於 startDate", () => {
  const data = validActivity();
  data.endDate = "2027-08-05";
  assert.ok(validateActivity(data, { settings }).errors.some((issue) => issue.code === "date.order"));
});

test("一般 URL 僅允許 HTTPS", () => {
  const data = validActivity();
  data.relatedUrl = "http://example.com";
  assert.ok(validateActivity(data, { settings }).errors.some((issue) => issue.code === "url.httpsOnly"));
  data.relatedUrl = "javascript:alert(1)";
  assert.ok(validateActivity(data, { settings }).errors.some((issue) => issue.code === "url.httpsOnly"));
});

test("外部圖片拒絕任意 host 並接受白名單 Supabase public bucket", async () => {
  const url = "https://project.supabase.co/storage/v1/object/public/cms-public/v1/activities/116-001/image.webp";
  const rejected = await validateImageReference(url, { settings });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.some((issue) => issue.code === "image.hostNotAllowed"));
  const accepted = await validateImageReference(url, {
    settings: { ...settings, allowedExternalImageHosts: ["project.supabase.co"] },
  });
  assert.equal(accepted.valid, true);
});

test("圖片拒絕 javascript、data、blob 與 http", async () => {
  for (const value of ["javascript:alert(1)", "data:image/png;base64,AA", "blob:https://example.com/1", "http://example.com/a.jpg"]) {
    const result = await validateImageReference(value, { settings });
    assert.equal(result.valid, false, value);
  }
});
