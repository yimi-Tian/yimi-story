import test from "node:test";
import assert from "node:assert/strict";
import { applyBaselinePlan, executeLocalSql, queryLocalJson } from "../../tools/baseline/baseline-db.mjs";
import { buildBaselinePlan, publicationRecordFromBaseline } from "../../tools/baseline/build-baseline.mjs";
import { exportActivities } from "../../tools/export-activities.mjs";
import { exportClassResults } from "../../tools/export-class-results.mjs";
import { createStage3HistoricalSiteRoot } from "./stage3-historical-fixture.mjs";

const enabled = process.env.YIMI_RUN_SUPABASE_INTEGRATION === "1";

test("真正 local Supabase baseline import 為 transactional、idempotent 且拒絕 conflict", { skip: !enabled }, async () => {
  const historicalSite = await createStage3HistoricalSiteRoot();
  const plan = await buildBaselinePlan({ siteRoot: historicalSite.root });
  try {
  const first = applyBaselinePlan(plan);
  assert.equal(first.inserted, 119);
  assert.equal(first.skipped, 0);
  const second = applyBaselinePlan(plan);
  assert.equal(second.inserted, 0);
  assert.equal(second.skipped, 119);
  assert.deepEqual({ items: second.contentItems, snapshots: second.snapshots, media: second.mediaAssets, drafts: second.contentDrafts, publications: second.githubPublications },
    { items: 119, snapshots: 119, media: 714, drafts: 0, publications: 0 });

  const rows = queryLocalJson(`select c.content_type::text, c.public_id, s.schema_version, s.snapshot_data, s.media_manifest,
    s.checksum_sha256, s.source_draft_id, s.source_revision, s.snapshot_source::text, s.status::text
    from public.content_items c join public.publication_snapshots s on s.id = c.published_snapshot_id
    order by c.content_type, c.public_id`);
  assert.equal(rows.length, 119);
  assert.ok(rows.every((row) => row.source_draft_id === null && row.source_revision === 0 && row.snapshot_source === "baseline_import" && row.status === "baseline_published"));
  for (const publicId of ["115-001", "CR-115-003", "112-015"]) assert.ok(rows.some((row) => row.public_id === publicId), publicId);

  const contentCounts = queryLocalJson(`select content_type::text, count(*)::integer as count from public.content_items group by content_type order by content_type`);
  assert.deepEqual(contentCounts, [{ content_type: "activity", count: 63 }, { content_type: "class_result", count: 56 }]);
  const publishedCount = queryLocalJson(`select count(*)::integer as count from public.content_items where published_snapshot_id is not null`);
  assert.equal(publishedCount[0].count, 119);
  const storageCounts = queryLocalJson(`select bucket_id, count(*)::integer as count from storage.objects where bucket_id in ('cms-drafts', 'cms-public') group by bucket_id`);
  assert.deepEqual(storageCounts, []);

  const expectedById = new Map(plan.records.map((record) => [`${record.contentType}:${record.publicId}`, record]));
  for (const row of rows) {
    const expected = expectedById.get(`${row.content_type}:${row.public_id}`);
    assert.deepEqual(row.snapshot_data, expected.snapshotData, row.public_id);
    assert.deepEqual(row.media_manifest, expected.mediaManifest, row.public_id);
    assert.equal(row.checksum_sha256, expected.checksumSha256, row.public_id);
  }

  const dbRecords = rows.map((row) => publicationRecordFromBaseline({
    contentType: row.content_type,
    publicId: row.public_id,
    schemaVersion: row.schema_version,
    snapshotData: row.snapshot_data,
    mediaManifest: row.media_manifest,
  }));
  const expectedRecords = plan.records.map(publicationRecordFromBaseline);
  const [dbClass, expectedClass, dbActivity, expectedActivity] = await Promise.all([
    exportClassResults(dbRecords.filter((record) => record.contentType === "class_result")),
    exportClassResults(expectedRecords.filter((record) => record.contentType === "class_result")),
    exportActivities(dbRecords.filter((record) => record.contentType === "activity"), { legacyImport: true }),
    exportActivities(expectedRecords.filter((record) => record.contentType === "activity"), { legacyImport: true }),
  ]);
  assert.deepEqual(dbClass.published, expectedClass.published);
  assert.deepEqual(dbActivity.rows, expectedActivity.rows);
  assert.equal(dbClass.jsonText.includes("3個朴子班級合併呈現"), false);
  assert.equal(dbActivity.csvText.includes("internalNotes"), false);

  const activity115001 = rows.find((row) => row.public_id === "115-001");
  assert.deepEqual({
    name: activity115001.snapshot_data.name,
    dateLabel: activity115001.snapshot_data.dateLabel,
    startDate: activity115001.snapshot_data.startDate,
    district: activity115001.snapshot_data.districts,
    venue: activity115001.snapshot_data.venue,
    participants: activity115001.snapshot_data.participants,
    sdgs: activity115001.snapshot_data.sdgs,
    leader: activity115001.snapshot_data.leader,
    media: activity115001.media_manifest.length,
  }, { name: "歌仔戲唱腔體驗坊", dateLabel: "7/7", startDate: null, district: ["朴子市"], venue: "嘉義縣立圖書館", participants: 38, sdgs: ["SDG 4", "SDG 11"], leader: "米雪", media: 8 });
  const activity112015 = rows.find((row) => row.public_id === "112-015");
  assert.equal(activity112015.snapshot_data.coverAssetId, null);
  assert.equal(activity112015.media_manifest.some((asset) => asset.role === "cover"), false);
  const class115003 = rows.find((row) => row.public_id === "CR-115-003");
  assert.equal(class115003.snapshot_data.internalNotes, "3個朴子班級合併呈現");

  const target = plan.records.find((record) => record.publicId === "115-001");
  try {
    executeLocalSql(`update public.publication_snapshots set checksum_sha256 = repeat('0', 64)
      where content_id = (select id from public.content_items where content_type = 'activity' and public_id = '115-001');`);
    assert.throws(() => applyBaselinePlan(plan), /BASELINE_CONFLICT/);
  } finally {
    executeLocalSql(`update public.publication_snapshots set checksum_sha256 = '${target.checksumSha256}'
      where content_id = (select id from public.content_items where content_type = 'activity' and public_id = '115-001');`);
  }
  const third = applyBaselinePlan(plan);
  assert.equal(third.skipped, 119);
  } finally {
    await historicalSite.cleanup();
  }
});
