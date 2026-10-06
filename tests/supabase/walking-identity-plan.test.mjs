import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { legacyWalkingFixtures } from "../content/fixtures/legacy-walking-records.mjs";
import { buildLegacyIdentityPlan } from "../../tools/walking/legacy-identity-import.mjs";
import { parseCsv } from "../../tools/content/csv.mjs";

const contentItems = legacyWalkingFixtures.map((fixture, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  content_type: "activity",
  public_id: fixture.activityPublicId,
}));

test("legacy identity dry-run resolves the exact five traceable Activity mappings", () => {
  const plan = buildLegacyIdentityPlan({ fixtures: legacyWalkingFixtures, contentItems, existingIdentities: [] });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.canApply, true);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.planned.map(({ activityPublicId, walkingRecordId }) => ({ activityPublicId, walkingRecordId })), [
    { walkingRecordId: "WR-112-001", activityPublicId: "112-002" },
    { walkingRecordId: "WR-112-002", activityPublicId: "112-010" },
    { walkingRecordId: "WR-112-003", activityPublicId: "112-011" },
    { walkingRecordId: "WR-112-004", activityPublicId: "112-014" },
    { walkingRecordId: "WR-114-001", activityPublicId: "114-018" },
  ]);
  assert.deepEqual(plan.planned.map((entry) => entry.allocatedYear), [112, 112, 112, 112, 114]);
});

test("legacy identity fixture Activity IDs each exist exactly once in the canonical activity source", async () => {
  const rows = parseCsv(await readFile(resolve(import.meta.dirname, "../../activities.csv"), "utf8"));
  for (const fixture of legacyWalkingFixtures) {
    assert.equal(rows.filter((row) => row["活動ID"] === fixture.activityPublicId).length, 1, fixture.activityPublicId);
  }
});

test("legacy dry-run is idempotent when the exact mappings already exist", () => {
  const existingIdentities = contentItems.map((content, index) => ({
    content_id: content.id,
    walking_record_id: legacyWalkingFixtures[index].walkingRecordId,
    allocated_year: Number(legacyWalkingFixtures[index].walkingRecordId.slice(3, 6)),
  }));
  const plan = buildLegacyIdentityPlan({ fixtures: legacyWalkingFixtures, contentItems, existingIdentities });
  assert.equal(plan.canApply, true);
  assert.equal(plan.planned.length, 0);
  assert.equal(plan.skipped.length, 5);
});

test("legacy dry-run blocks missing, non-Activity and conflicting identity mappings", () => {
  const missing = buildLegacyIdentityPlan({ fixtures: legacyWalkingFixtures, contentItems: contentItems.slice(1), existingIdentities: [] });
  assert.equal(missing.canApply, false);
  assert.equal(missing.errors[0].code, "activity_not_found");

  const nonActivity = buildLegacyIdentityPlan({
    fixtures: [legacyWalkingFixtures[0]],
    contentItems: [{ ...contentItems[0], content_type: "class_result" }],
    existingIdentities: [],
  });
  assert.equal(nonActivity.errors[0].code, "content_type_mismatch");

  const conflicting = buildLegacyIdentityPlan({
    fixtures: [legacyWalkingFixtures[0]],
    contentItems: [contentItems[0]],
    existingIdentities: [{ content_id: contentItems[0].id, walking_record_id: "WR-112-099", allocated_year: 112 }],
  });
  assert.equal(conflicting.errors[0].code, "content_mapping_conflict");

  const walkingIdConflict = buildLegacyIdentityPlan({
    fixtures: [legacyWalkingFixtures[0]],
    contentItems: [contentItems[0]],
    existingIdentities: [{ content_id: contentItems[1].id, walking_record_id: "WR-112-001", allocated_year: 112 }],
  });
  assert.equal(walkingIdConflict.errors[0].code, "walking_id_conflict");
});
