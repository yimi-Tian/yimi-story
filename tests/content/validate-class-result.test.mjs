import test from "node:test";
import assert from "node:assert/strict";
import { validateClassResult } from "../../tools/content/validate-class-result.mjs";

const settings = { allowedDistricts: ["朴子市"] };

function validClassResult() {
  return {
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
    internalNotes: null,
    publicNotes: null,
    coverAssetId: "cover-1",
    galleryAssetIds: [],
  };
}

test("有效班級成果通過驗證", () => {
  assert.equal(validateClassResult(validClassResult(), { settings }).valid, true);
});

test("班級 ID 年度必須與 year 一致", () => {
  const data = validClassResult();
  data.year = 115;
  const result = validateClassResult(data, { settings });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((issue) => issue.code === "year.idMismatch"));
});

test("新資料不可使用服務範圍外地區，legacy 只警告", () => {
  const data = validClassResult();
  data.districts = ["番路鄉"];
  assert.equal(validateClassResult(data, { settings }).valid, false);
  const legacy = validateClassResult(data, { settings, legacyImport: true });
  assert.equal(legacy.valid, true);
  assert.ok(legacy.warnings.some((issue) => issue.code === "legacyImport.district"));
});
