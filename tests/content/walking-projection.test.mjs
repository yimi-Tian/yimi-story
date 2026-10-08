import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { legacyWalkingFixtures } from "./fixtures/legacy-walking-records.mjs";
import {
  LEGACY_WALKING_TYPE_PENDING,
  canonicalizePublicMediaPath,
  classifyWalkingByteDiff,
  generateWalkingFallback,
  runLegacyWalkingProjectionDryRun,
  samePublicMedia,
  semanticWalkingDiff,
} from "../../tools/walking/project-legacy-walking-records.mjs";

const root = resolve(import.meta.dirname, "../..");
const toolPath = resolve(root, "tools/walking/project-legacy-walking-records.mjs");
const report = await runLegacyWalkingProjectionDryRun(root);
const row = (id) => report.rows.find((entry) => entry.walkingRecordId === id);
const require = createRequire(import.meta.url);
const { getPublicWalkingRecords } = require("../../js/public-ux.js");

test("5 筆 shared fields 由 Activity 與 effective location 精確重建", () => {
  for (const entry of report.rows) {
    assert.deepEqual(
      ["year", "date", "townships", "location", "relatedActivityIds"].map((field) => entry.projected[field]),
      ["year", "date", "townships", "location", "relatedActivityIds"].map((field) => entry.current[field]),
      entry.walkingRecordId,
    );
  }
});

test("WR-112-004 使用 location override 且其他四筆沿用 Activity venue", () => {
  assert.equal(row("WR-112-004").projected.location, "水上三界埔、中埔鹽館、沄水溪、後坑仔溪");
  assert.equal(legacyWalkingFixtures.filter((fixture) => fixture.locationOverride === null).length, 4);
});

test("5 筆 title exact match", () => {
  for (const entry of report.rows) assert.equal(entry.projected.title, entry.current.title, entry.walkingRecordId);
});

test("5 筆 summary 只來自 Walking extension 且 exact match", () => {
  for (const fixture of legacyWalkingFixtures) {
    assert.equal(row(fixture.walkingRecordId).projected.summary, fixture.walkingSummary);
    assert.notEqual(fixture.walkingSummary, fixture.activitySummary);
  }
});

test("routeSummary 逐字 exact match", () => {
  for (const entry of report.rows) assert.equal(entry.projected.routeSummary, entry.current.routeSummary, entry.walkingRecordId);
});

test("stops 數量、name 與 nullable note 語意 exact match", () => {
  for (const entry of report.rows) {
    const normalized = (stops) => stops.map((stop) => ({ name: stop.name, note: stop.note ?? null }));
    assert.deepEqual(normalized(entry.projected.stops), normalized(entry.current.stops), entry.walkingRecordId);
  }
});

test("stops 保留 fixture 順序", () => {
  for (const fixture of legacyWalkingFixtures) {
    assert.deepEqual(row(fixture.walkingRecordId).projected.stops.map((stop) => stop.name), fixture.stops.map((stop) => stop.name));
  }
});

test("fieldNotes 逐字 exact match", () => {
  for (const entry of report.rows) assert.deepEqual(entry.projected.fieldNotes, entry.current.fieldNotes, entry.walkingRecordId);
});

test("fieldNotes 保留 fixture 順序", () => {
  for (const fixture of legacyWalkingFixtures) assert.deepEqual(row(fixture.walkingRecordId).projected.fieldNotes, fixture.fieldNotes);
});

test("Digital Walk relation 只為 WR-112-004 建立 DW-YG-001", () => {
  assert.deepEqual(report.rows.map((entry) => entry.projected.relatedDigitalWalkIds), [[], [], [], ["DW-YG-001"], []]);
});

test("任何 Legacy Walking projection 都不含 DW-WT-001", () => {
  assert.equal(report.projectedRecords.some((record) => record.relatedDigitalWalkIds.includes("DW-WT-001")), false);
});

test("5 筆 cover mapping 指向 current formal media", () => {
  for (const entry of report.rows) assert.equal(samePublicMedia(entry.projected.coverImage, entry.current.coverImage), true, entry.walkingRecordId);
});

test("5 筆 cover 與 gallery ownership 均由對應 Activity 證明", () => {
  assert.equal(report.summary.mediaOwnershipValid, 5);
  assert.ok(report.rows.every((entry) => entry.mediaOwnershipValid));
});

test("Walking gallery 等於 Activity gallery 減去 effective cover", () => {
  for (const entry of report.rows) {
    assert.deepEqual(entry.projected.gallery.map(canonicalizePublicMediaPath), entry.current.gallery.map(canonicalizePublicMediaPath));
    assert.equal(entry.projected.gallery.some((path) => samePublicMedia(path, entry.projected.coverImage)), false);
  }
});

test("gallery 順序與 current public output 完全一致", () => {
  for (const entry of report.rows) {
    assert.deepEqual(entry.projected.gallery.map(canonicalizePublicMediaPath), entry.current.gallery.map(canonicalizePublicMediaPath), entry.walkingRecordId);
  }
});

test("legacy path canonicalization 只合併表示差異", () => {
  assert.equal(canonicalizePublicMediaPath("/images/activities/112-002/01.jpg"), "images/activities/112-002/01.jpg");
  assert.equal(canonicalizePublicMediaPath("public/images/activities/112-002/01.jpg"), "images/activities/112-002/01.jpg");
  assert.equal(samePublicMedia("/images/a.jpg", "public/images/a.jpg"), true);
  assert.equal(samePublicMedia("/images/a.jpg", "public/images/b.jpg"), false);
  assert.equal(samePublicMedia("/images/a.JPG", "public/images/a.jpg"), false);
});

test("published Activity compatibility mapping 為 approved 與 publicly listed", () => {
  assert.ok(report.projectedRecords.every((record) => record.publicationStatus === "approved" && record.publiclyListed === true));
});

test("5 筆 type 均保持 pending manual classification", () => {
  assert.equal(report.summary.typePendingManualClassification, 5);
  assert.ok(report.rows.every((entry) => entry.projected.type === null && entry.typeStatus === LEGACY_WALKING_TYPE_PENDING));
});

test("排除 additive type 後 5 筆 semantic comparison 零差異", () => {
  assert.equal(report.summary.semanticMatches, 5);
  for (const entry of report.rows) assert.deepEqual(semanticWalkingDiff(entry.projected, entry.current), []);
});

test("byte diff 將 path representation 判為 formatting-only 而非 semantic diff", () => {
  assert.equal(report.summary.byteExact, 1);
  assert.equal(report.summary.formattingOnly, 4);
  assert.equal(row("WR-114-001").byteClassification, "byte-exact");
  assert.equal(classifyWalkingByteDiff({ ...row("WR-114-001").projected, title: "不同" }, row("WR-114-001").current), "semantic-diff");
});

test("projected JSON 與 deterministic JS fallback 內容一致", () => {
  const context = { window: {} };
  vm.runInNewContext(generateWalkingFallback(report.projectedRecords), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.WALKING_RECORDS_DATA)), report.projectedRecords);
  assert.equal(generateWalkingFallback(report.projectedRecords), generateWalkingFallback(structuredClone(report.projectedRecords)));
});

test("projected records 相容現有 public selector 且 additive type 不影響排序", () => {
  assert.deepEqual(getPublicWalkingRecords(report.projectedRecords).map((record) => record.id), ["WR-114-001", "WR-112-001", "WR-112-002", "WR-112-003", "WR-112-004"]);
  for (const record of report.projectedRecords) {
    assert.equal(typeof record.title, "string");
    assert.equal(typeof record.summary, "string");
    assert.ok(Array.isArray(record.stops) && Array.isArray(record.fieldNotes) && Array.isArray(record.gallery));
  }
});

test("WB2 importer 與 WB4 projection 共用同一 legacy fixture mapping", async () => {
  const [wb2Source, wb4Source] = await Promise.all([
    readFile(resolve(root, "tools/walking/legacy-identity-import.mjs"), "utf8"),
    readFile(toolPath, "utf8"),
  ]);
  assert.match(wb2Source, /tests\/content\/fixtures\/legacy-walking-records\.mjs/);
  assert.match(wb4Source, /tests\/content\/fixtures\/legacy-walking-records\.mjs/);
  assert.deepEqual(report.rows.map(({ walkingRecordId, activityPublicId }) => ({ walkingRecordId, activityPublicId })), legacyWalkingFixtures.map(({ walkingRecordId, activityPublicId }) => ({ walkingRecordId, activityPublicId })));
});

test("projection dry-run 不修改 input、正式 JSON 或 JS fallback", async () => {
  const formalPaths = [resolve(root, "data/walking-records.json"), resolve(root, "data/walking-records-data.js")];
  const before = await Promise.all(formalPaths.map((path) => readFile(path, "utf8")));
  const output = execFileSync(process.execPath, [toolPath], { cwd: root, encoding: "utf8" });
  const after = await Promise.all(formalPaths.map((path) => readFile(path, "utf8")));
  assert.match(output, /Legacy Walking Projection Dry Run/);
  assert.match(output, /WR-112-004  MATCH/);
  assert.match(output, /5 semantic matches/);
  assert.deepEqual(after, before);
  const apply = spawnSync(process.execPath, [toolPath, "--apply"], { cwd: root, encoding: "utf8" });
  assert.notEqual(apply.status, 0);
  assert.match(apply.stderr, /does not support --apply/);
});
