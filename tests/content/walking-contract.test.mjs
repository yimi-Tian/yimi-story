import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeActivity } from "../../tools/content/normalize-activity.mjs";
import { validateActivity } from "../../tools/content/validate-activity.mjs";
import {
  effectiveWalkingLocation,
  effectiveWalkingTitle,
  normalizeWalkingRecord,
  WALKING_RECORD_KEYS,
  WALKING_STOP_KEYS,
  WALKING_TYPES,
} from "../../tools/content/walking-contract.mjs";
import { legacyWalkingFixtures } from "./fixtures/legacy-walking-records.mjs";

const settings = { allowedDistricts: ["朴子市"], allowedExternalImageHosts: [] };

function activity(walkingRecord = null) {
  return {
    id: "116-001", year: 116, name: "地方文化學習活動", startDate: "2027-08-06", endDate: null,
    dateLabel: "8/6", districts: ["朴子市"], venue: "測試場地", projectName: null,
    activityType: "走讀", topic: "地方文化", sdgs: ["SDG 4"],
    summary: "這是一段符合最小長度的活動效益摘要，用來驗證活動資料的完整性。", participants: 20,
    partnerOrganizations: null, leader: null, keywords: [], videoUrl: null, relatedUrl: null,
    featured: false, internalNotes: null, publicNotes: null, coverAssetId: "cover-1", galleryAssetIds: [],
    walkingRecord,
  };
}

function validWalking(overrides = {}) {
  return {
    type: "地方走讀",
    titleOverride: null,
    locationOverride: null,
    summary: "走進地方街區，觀察聚落空間、生活文化與居民留下的現場記憶。",
    routeSummary: "從主要街區走到地方信仰中心。",
    stops: [{ name: "地方廟宇", note: null }],
    fieldNotes: [],
    digitalWalkId: null,
    coverAssetId: null,
    ...overrides,
  };
}

test("舊 Activity 未提供 walkingRecord 時正規化為 null 且通過驗證", () => {
  const input = activity();
  delete input.walkingRecord;
  const normalized = normalizeActivity(input).data;
  assert.equal(normalized.walkingRecord, null);
  assert.equal(validateActivity(normalized, { settings }).valid, true);
});

test("walkingRecord null 保持 null", () => {
  assert.equal(normalizeActivity(activity(null)).data.walkingRecord, null);
});

test("合法 Walking extension 完整正規化並通過驗證", () => {
  const normalized = normalizeActivity(activity(validWalking({
    type: "  聚落踏查  ", titleOverride: "  聚落走讀  ", summary: "  走進聚落街區，觀察地方空間、生活文化與居民留下的現場記憶。  ",
  }))).data;
  assert.equal(normalized.walkingRecord.type, "聚落踏查");
  assert.equal(normalized.walkingRecord.titleOverride, "聚落走讀");
  assert.equal(validateActivity(normalized, { settings }).valid, true);
});

test("Walking type 僅接受正式 enum", () => {
  const result = validateActivity(activity(validWalking({ type: "__PENDING_MANUAL_CLASSIFICATION__" })), { settings });
  assert.ok(result.errors.some((issue) => issue.code === "walking.type"));
  assert.deepEqual(WALKING_TYPES, ["地方走讀", "聚落踏查", "流域觀察", "生態觀察", "訪談／口述", "文史採集", "產業地景", "其他"]);
});

test("Walking root 未知欄位在 normalize 後仍由 runtime validator 拒絕", () => {
  const normalized = normalizeActivity(activity(validWalking({ unexpected: true }))).data;
  const result = validateActivity(normalized, { settings });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((issue) => issue.field === "walkingRecord.unexpected" && issue.message.includes("unexpected")));
});

test("Walking root 多個未知欄位逐一指出 key", () => {
  const result = validateActivity(activity(validWalking({ alpha: true, omega: false })), { settings });
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.errors.filter((issue) => issue.code === "object.unsupportedProperty").map((issue) => issue.field).sort(),
    ["walkingRecord.alpha", "walkingRecord.omega"],
  );
});

test("第一個 stop 未知欄位在 normalize 後仍由 runtime validator 拒絕", () => {
  const normalized = normalizeActivity(activity(validWalking({
    stops: [{ name: "三界埔", note: null, unexpected: true }],
  }))).data;
  const result = validateActivity(normalized, { settings });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((issue) => issue.field === "walkingRecord.stops[0].unexpected" && issue.message.includes("unexpected")));
});

test("第二個 stop 未知欄位回報正確 index 與 key", () => {
  const result = validateActivity(activity(validWalking({
    stops: [{ name: "第一站", note: null }, { name: "第二站", note: "說明", foo: true }],
  })), { settings });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((issue) => issue.field === "walkingRecord.stops[1].foo" && issue.message.includes("foo")));
});

test("合法 stop note 為 null 或文字皆通過", () => {
  for (const note of [null, "現場觀察說明"]) {
    const result = validateActivity(activity(validWalking({ stops: [{ name: "第一站", note }] })), { settings });
    assert.equal(result.valid, true);
  }
});

test("runtime Walking allowed keys 與 JSON Schema properties 保持一致", async () => {
  const schema = JSON.parse(await readFile(new URL("../../schemas/activity.schema.json", import.meta.url), "utf8"));
  const walkingSchema = schema.properties.walkingRecord.oneOf.find((entry) => entry.type === "object");
  assert.deepEqual([...WALKING_RECORD_KEYS].sort(), Object.keys(walkingSchema.properties).sort());
  assert.deepEqual([...WALKING_STOP_KEYS].sort(), Object.keys(walkingSchema.properties.stops.items.properties).sort());
});

test("Walking summary 必填且限制 20～1500 字", () => {
  for (const [value, code] of [["   ", "blank"], ["太短", "short"], ["走".repeat(1501), "long"]]) {
    const result = validateActivity(activity(validWalking({ summary: value })), { settings });
    assert.ok(result.errors.some((issue) => issue.code === "walking.summary.length"), code);
  }
});

test("選填文字空白正規化為 null", () => {
  const normalized = normalizeWalkingRecord(validWalking({
    titleOverride: "   ", locationOverride: " \t ", routeSummary: "\t", digitalWalkId: " ", coverAssetId: "\n",
  }));
  assert.equal(normalized.titleOverride, null);
  assert.equal(normalized.locationOverride, null);
  assert.equal(normalized.routeSummary, null);
  assert.equal(normalized.digitalWalkId, null);
  assert.equal(normalized.coverAssetId, null);
});

test("stop 移除全空 row、保留 note-only row 讓 validator 阻擋、空 note 轉 null", () => {
  const walking = normalizeWalkingRecord(validWalking({
    stops: [
      { name: "  ", note: "  " },
      { name: "  第一站  ", note: "  " },
      { name: "  ", note: "有說明但沒有名稱" },
    ],
  }));
  assert.deepEqual(walking.stops, [
    { name: "第一站", note: null },
    { name: "", note: "有說明但沒有名稱" },
  ]);
  const result = validateActivity(activity(walking), { settings });
  assert.ok(result.errors.some((issue) => issue.code === "walking.stop.name"));
});

test("fieldNotes 移除空白並保持原始順序", () => {
  const walking = normalizeWalkingRecord(validWalking({ fieldNotes: ["  第二筆  ", "", " 第一筆 ", "   "] }));
  assert.deepEqual(walking.fieldNotes, ["第二筆", "第一筆"]);
});

test("routeSummary、有效 stops、fieldNotes 至少需有一項", () => {
  const result = validateActivity(activity(validWalking({ routeSummary: null, stops: [], fieldNotes: [] })), { settings });
  assert.ok(result.errors.some((issue) => issue.code === "walking.content.required"));
});

test("effectiveWalkingTitle 支援 override 與 Activity name fallback", () => {
  const base = activity(validWalking({ titleOverride: "走讀專屬標題" }));
  assert.equal(effectiveWalkingTitle(base), "走讀專屬標題");
  assert.equal(effectiveWalkingTitle({ ...base, name: "修改後活動名稱" }), "走讀專屬標題");
  assert.equal(effectiveWalkingTitle(activity(validWalking({ titleOverride: null }))), "地方文化學習活動");
  assert.equal(effectiveWalkingTitle({ ...activity(validWalking({ titleOverride: null })), name: "修改後活動名稱" }), "修改後活動名稱");
});

test("effectiveWalkingLocation 支援 nullable override 與 Activity venue fallback", () => {
  assert.equal(effectiveWalkingLocation(activity(validWalking({ locationOverride: null }))), "測試場地");
  assert.equal(effectiveWalkingLocation(activity(validWalking({ locationOverride: "   " }))), "測試場地");
  assert.equal(effectiveWalkingLocation(activity(validWalking({ locationOverride: "  三界埔、鹽館  " }))), "三界埔、鹽館");
});

test("Activity venue 修改時只在沒有 location override 時影響 effective Walking location", () => {
  assert.equal(effectiveWalkingLocation({ ...activity(validWalking()), venue: "修改後活動地點" }), "修改後活動地點");
  assert.equal(effectiveWalkingLocation({ ...activity(validWalking({ locationOverride: "走讀專屬地點" })), venue: "修改後活動地點" }), "走讀專屬地點");
});

test("locationOverride 非 null 時不可空白且最多 300 字", () => {
  for (const value of ["   ", "地".repeat(301), 123]) {
    const result = validateActivity(activity(validWalking({ locationOverride: value })), { settings });
    assert.ok(result.errors.some((issue) => issue.code === "walking.locationOverride.invalid"));
  }
  assert.equal(validateActivity(activity(validWalking({ locationOverride: "地".repeat(300) })), { settings }).valid, true);
});

test("Walking extension 不重複 shared fields", () => {
  const keys = Object.keys(normalizeWalkingRecord(validWalking())).sort();
  assert.deepEqual(keys, ["coverAssetId", "digitalWalkId", "fieldNotes", "locationOverride", "routeSummary", "stops", "summary", "titleOverride", "type"]);
  for (const forbidden of ["activityId", "year", "startDate", "endDate", "dateLabel", "districts", "venue", "publicationStatus", "publiclyListed", "galleryAssetIds", "relatedActivityIds"]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
});

test("Legacy 5 筆全部保留 titleOverride 且 pending type 不污染正式 contract", () => {
  assert.equal(legacyWalkingFixtures.length, 5);
  for (const fixture of legacyWalkingFixtures) {
    assert.notEqual(fixture.titleOverride, fixture.activityName, fixture.walkingRecordId);
    assert.equal(normalizeWalkingRecord({ ...validWalking(), titleOverride: fixture.titleOverride }).titleOverride, fixture.titleOverride);
    assert.equal(fixture.legacyWalkingType, null);
  }
  assert.equal(WALKING_TYPES.includes("__PENDING_MANUAL_CLASSIFICATION__"), false);
});

test("Legacy 5 筆 Walking summary 與 Activity summary 不同且逐字保留", () => {
  for (const fixture of legacyWalkingFixtures) {
    assert.notEqual(fixture.walkingSummary, fixture.activitySummary, fixture.walkingRecordId);
    const normalized = normalizeWalkingRecord({ ...validWalking(), summary: fixture.walkingSummary });
    assert.equal(normalized.summary, fixture.walkingSummary, fixture.walkingRecordId);
  }
});

test("Legacy 5 筆只為 WR-112-004 保留地點 override", () => {
  assert.deepEqual(
    legacyWalkingFixtures.map(({ walkingRecordId, locationOverride }) => ({ walkingRecordId, locationOverride })),
    [
      { walkingRecordId: "WR-112-001", locationOverride: null },
      { walkingRecordId: "WR-112-002", locationOverride: null },
      { walkingRecordId: "WR-112-003", locationOverride: null },
      { walkingRecordId: "WR-112-004", locationOverride: "水上三界埔、中埔鹽館、沄水溪、後坑仔溪" },
      { walkingRecordId: "WR-114-001", locationOverride: null },
    ],
  );
  const chilan = legacyWalkingFixtures.find((fixture) => fixture.walkingRecordId === "WR-112-004");
  assert.equal(effectiveWalkingLocation(activity(validWalking({ locationOverride: chilan.locationOverride }))), "水上三界埔、中埔鹽館、沄水溪、後坑仔溪");
});
