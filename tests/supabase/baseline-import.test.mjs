import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BASELINE_IMPORT_USER_ID,
  assertLocalDatabaseUrl,
  assertProductionDatabaseTarget,
} from "../../tools/baseline/baseline-db.mjs";
import { buildBaselinePlan, publicationRecordFromBaseline } from "../../tools/baseline/build-baseline.mjs";
import { canonicalStringify, snapshotChecksum } from "../../tools/baseline/canonical-json.mjs";
import { exportActivities } from "../../tools/export-activities.mjs";
import { exportClassResults } from "../../tools/export-class-results.mjs";
import { createStage3HistoricalSiteRoot } from "./stage3-historical-fixture.mjs";

const root = resolve(import.meta.dirname, "../..");
let historicalSite;
let cachedPlan;
before(async () => { historicalSite = await createStage3HistoricalSiteRoot(); });
after(async () => { await historicalSite?.cleanup(); });
const plan = async () => cachedPlan ||= buildBaselinePlan({ siteRoot: historicalSite.root });

test("Stage 3 歷史 baseline fixture 精確包含 56、63、119、714，且不建立 drafts 或 GitHub publications", async () => {
  const result = await plan();
  assert.deepEqual({
    classes: result.report.classResultCount,
    activities: result.report.activityCount,
    items: result.report.contentItemCount,
    snapshots: result.report.snapshotCount,
    media: result.report.mediaAssetCount,
    drafts: result.report.contentDraftCount,
    publications: result.report.githubPublicationCount,
  }, { classes: 56, activities: 63, items: 119, snapshots: 119, media: 714, drafts: 0, publications: 0 });
  assert.equal(result.report.validationErrorCount, 0);
  assert.equal(result.report.duplicateIdCount, 0);
  assert.equal(result.report.legacyWarningCount, 68);
  assert.equal(result.report.unparsedLegacyDateCount, 63);
  assert.equal(result.report.outsideServiceAreaWarningCount, 4);
  assert.equal(result.report.missingCoverWarningCount, 1);
});

test("Stage 3 歷史 baseline build 與 snapshot checksum 可重現", async () => {
  const first = await plan();
  const second = await buildBaselinePlan({ siteRoot: historicalSite.root });
  assert.equal(second.report.aggregateChecksumSha256, first.report.aggregateChecksumSha256);
  assert.deepEqual(second.records.map((record) => record.checksumSha256), first.records.map((record) => record.checksumSha256));
  const sample = first.records[0];
  assert.equal(sample.checksumSha256, snapshotChecksum(sample));
});

test("714 個 legacy media 具有檔案 header metadata、SHA-256 與穩定 asset key", async () => {
  const result = await plan();
  const media = result.records.flatMap((record) => record.media);
  assert.equal(media.length, 714);
  assert.ok(media.every((asset) => asset.stableAssetKey && asset.byteSize > 0 && asset.width > 0 && asset.height > 0));
  assert.ok(media.every((asset) => /^[0-9a-f]{64}$/.test(asset.sha256)));
  assert.ok(media.every((asset) => ["image/jpeg", "image/png"].includes(asset.mimeType)));
  assert.ok(media.every((asset) => ["jpg", "jpeg", "png"].includes(asset.extension)));
});

test("legacy 日期、缺封面與 internalNotes 依 canonical 規則保留", async () => {
  const result = await plan();
  assert.equal(result.records.filter((record) => record.contentType === "activity" && record.snapshotData.startDate === null).length, 63);
  const missingCover = result.records.find((record) => record.publicId === "112-015");
  assert.equal(missingCover.snapshotData.coverAssetId, null);
  assert.equal(result.records.filter((record) => record.snapshotData.internalNotes !== null).length, 49);
});

test("baseline snapshot 保留 internalNotes，但正式 exporter 不輸出 internalNotes", async () => {
  const result = await plan();
  const withNotes = result.records.find((record) => record.snapshotData.internalNotes);
  assert.ok(canonicalStringify(withNotes.snapshotData).includes("internalNotes"));
  const classes = result.records.filter((record) => record.contentType === "class_result").map(publicationRecordFromBaseline);
  const activities = result.records.filter((record) => record.contentType === "activity").map(publicationRecordFromBaseline);
  const classOutput = await exportClassResults(classes);
  const activityOutput = await exportActivities(activities, { legacyImport: true });
  assert.equal(classOutput.jsonText.includes("internalNotes"), false);
  assert.equal(activityOutput.csvText.includes("internalNotes"), false);
});

test("由 baseline 重建正式輸出時保留全部既有圖片參照", async () => {
  const result = await plan();
  const classes = result.records.filter((record) => record.contentType === "class_result").map(publicationRecordFromBaseline);
  const activities = result.records.filter((record) => record.contentType === "activity").map(publicationRecordFromBaseline);
  const classOutput = await exportClassResults(classes);
  const activityOutput = await exportActivities(activities, { legacyImport: true });
  assert.equal(classOutput.published.length, 56);
  assert.equal(activityOutput.rows.length, 63);
  assert.equal(classOutput.published.reduce((count, item) => count + 1 + item.images.length, 0)
    + activityOutput.rows.reduce((count, item) => count + (item["封面照片路徑"] ? 1 : 0) + (item["成果照片路徑"] ? item["成果照片路徑"].split(",").length : 0), 0), 714);
});

test("資料庫安全閘門拒絕遠端 host 與非 local port", () => {
  assert.doesNotThrow(() => assertLocalDatabaseUrl("postgresql://postgres:local@127.0.0.1:54322/postgres"));
  assert.throws(() => assertLocalDatabaseUrl("postgresql://postgres:x@example.supabase.co:5432/postgres"), /本機/);
  assert.throws(() => assertLocalDatabaseUrl("postgresql://postgres:x@localhost:5432/postgres"), /54322/);
});

test("production baseline 需通過 project allowlist、精確 host、explicit gate 與不同 system actor", () => {
  const ref = "abcdefghijklmnopqrst";
  const actorId = "11111111-1111-4111-8111-111111111111";
  const url = `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres`;
  const options = { expectedProjectRef: ref, expectedRegion: "ap-northeast-2", projectRef: ref, confirmation: ref, allowProduction: "true", actorId };
  assert.doesNotThrow(() => assertProductionDatabaseTarget(url, options));
  assert.throws(() => assertProductionDatabaseTarget(url, { ...options, projectRef: "bbbbbbbbbbbbbbbbbbbb" }), /allowlist/);
  assert.throws(() => assertProductionDatabaseTarget(url.replace(ref, "bbbbbbbbbbbbbbbbbbbb"), options), /allowlist/);
  assert.throws(() => assertProductionDatabaseTarget(url, { ...options, confirmation: "wrong" }), /確認值/);
  assert.throws(() => assertProductionDatabaseTarget(url, { ...options, allowProduction: "false" }), /ALLOW_PRODUCTION/);
  assert.throws(() => assertProductionDatabaseTarget(url, { ...options, actorId: BASELINE_IMPORT_USER_ID }), /actor UUID/);
  assert.throws(() => assertProductionDatabaseTarget(url.replace(":5432", ":6543"), options), /allowlist/);
  const poolerUrl = `postgresql://postgres.${ref}:password@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`;
  assert.doesNotThrow(() => assertProductionDatabaseTarget(poolerUrl, options));
  assert.throws(() => assertProductionDatabaseTarget(poolerUrl.replace("ap-northeast-2", "ap-southeast-1"), options), /allowlist/);
  assert.throws(() => assertProductionDatabaseTarget(poolerUrl.replace(`postgres.${ref}`, "postgres.other"), options), /allowlist/);
});

test("Stage 3 migration 明確區分 baseline snapshot，legacy portrait unknown 不放寬新上傳", async () => {
  const sql = await readFile(resolve(root, "supabase/migrations/202608180003_baseline_import_support.sql"), "utf8");
  assert.match(sql, /snapshot_source.*baseline_import/s);
  assert.match(sql, /source_revision = 0/);
  assert.match(sql, /contains_portrait is null/);
  assert.match(sql, /rights_status <> 'legacy_retained'.*contains_portrait is not null/s);
  assert.match(sql, /legacy_asset_key/);
});

test("production/import transaction 的 result temp table 在 pooler backend commit後清除", async () => {
  const source = await readFile(resolve(root, "tools/baseline/baseline-db.mjs"), "utf8");
  const resultCommitPattern = /\)::text from baseline_import_result;\r?\ncommit;/i;
  assert.match(source, /drop table if exists pg_temp\.baseline_import_result/i);
  assert.match(source, /create temporary table baseline_import_result[\s\S]*on commit drop/i);
  assert.match(source, resultCommitPattern);
  assert.match(")::text from baseline_import_result;\ncommit;", resultCommitPattern);
  assert.match(")::text from baseline_import_result;\r\ncommit;", resultCommitPattern);
});
