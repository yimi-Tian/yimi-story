import { pathToFileURL } from "node:url";
import { executeLocalSql, queryLocalJson } from "../baseline/baseline-db.mjs";
import { legacyWalkingFixtures } from "../../tests/content/fixtures/legacy-walking-records.mjs";

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function identityYear(walkingRecordId) {
  const match = /^WR-([0-9]{3})-[0-9]{3}$/.exec(walkingRecordId);
  return match ? Number(match[1]) : null;
}

export function buildLegacyIdentityPlan({ fixtures, contentItems, existingIdentities }) {
  const errors = [];
  const planned = [];
  const skipped = [];
  const seenActivityIds = new Set();
  const seenWalkingIds = new Set();
  const contentByPublicId = new Map(contentItems.map((item) => [item.public_id, item]));
  const identityByContentId = new Map(existingIdentities.map((identity) => [identity.content_id, identity]));
  const identityByWalkingId = new Map(existingIdentities.map((identity) => [identity.walking_record_id, identity]));

  for (const fixture of fixtures) {
    const { activityPublicId, walkingRecordId } = fixture;
    const allocatedYear = identityYear(walkingRecordId);
    if (allocatedYear === null) {
      errors.push({ activityPublicId, walkingRecordId, code: "invalid_walking_record_id" });
      continue;
    }
    if (seenActivityIds.has(activityPublicId)) {
      errors.push({ activityPublicId, walkingRecordId, code: "duplicate_activity_fixture" });
      continue;
    }
    if (seenWalkingIds.has(walkingRecordId)) {
      errors.push({ activityPublicId, walkingRecordId, code: "duplicate_walking_id_fixture" });
      continue;
    }
    seenActivityIds.add(activityPublicId);
    seenWalkingIds.add(walkingRecordId);

    const content = contentByPublicId.get(activityPublicId);
    if (!content) {
      errors.push({ activityPublicId, walkingRecordId, code: "activity_not_found" });
      continue;
    }
    if (content.content_type !== "activity") {
      errors.push({ activityPublicId, walkingRecordId, code: "content_type_mismatch" });
      continue;
    }

    const byContent = identityByContentId.get(content.id);
    const byWalkingId = identityByWalkingId.get(walkingRecordId);
    if (byContent) {
      if (byContent.walking_record_id === walkingRecordId && byContent.allocated_year === allocatedYear) {
        skipped.push({ contentId: content.id, activityPublicId, walkingRecordId, reason: "already_present" });
      } else {
        errors.push({ activityPublicId, walkingRecordId, code: "content_mapping_conflict" });
      }
      continue;
    }
    if (byWalkingId && byWalkingId.content_id !== content.id) {
      errors.push({ activityPublicId, walkingRecordId, code: "walking_id_conflict" });
      continue;
    }

    planned.push({ contentId: content.id, activityPublicId, walkingRecordId, allocatedYear });
  }

  return { mode: "dry-run", planned, skipped, errors, canApply: errors.length === 0 };
}

export function applyLegacyIdentityPlan(plan, actorId) {
  if (!plan.canApply || plan.errors.length > 0) throw new Error("legacy identity plan has blocking errors");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId ?? "")) {
    throw new Error("--actor-id must be a valid UUID");
  }
  const values = plan.planned.map((entry) => `(
    ${sqlText(entry.contentId)}::uuid,
    ${sqlText(entry.walkingRecordId)},
    ${entry.allocatedYear},
    ${sqlText(actorId)}::uuid
  )`).join(",\n");
  if (!values) return { inserted: 0 };

  const output = executeLocalSql(`begin;
do $actor$
begin
  if not exists (
    select 1 from public.admin_users
    where user_id = ${sqlText(actorId)}::uuid and is_active = true
  ) then
    raise exception 'active local admin actor required';
  end if;
end
$actor$;
insert into public.activity_walking_identities (
  content_id, walking_record_id, allocated_year, created_by
) values ${values};
select json_build_object('inserted', ${plan.planned.length})::text;
commit;`).trim().split(/\r?\n/).filter((line) => line.startsWith("{")).at(-1);
  return JSON.parse(output);
}

export function loadLocalLegacyIdentityPlan() {
  const publicIds = legacyWalkingFixtures.map((fixture) => sqlText(fixture.activityPublicId)).join(", ");
  const contentItems = queryLocalJson(`select id, content_type::text, public_id
    from public.content_items where public_id in (${publicIds})`);
  const existingIdentities = queryLocalJson(`select content_id, walking_record_id, allocated_year
    from public.activity_walking_identities`);
  return buildLegacyIdentityPlan({ fixtures: legacyWalkingFixtures, contentItems, existingIdentities });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const actorIndex = process.argv.indexOf("--actor-id");
  const actorId = actorIndex >= 0 ? process.argv[actorIndex + 1] : null;
  const plan = loadLocalLegacyIdentityPlan();
  const result = apply ? applyLegacyIdentityPlan(plan, actorId) : plan;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
