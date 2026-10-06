import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { executeLocalSql, queryLocalJson } from "../../tools/baseline/baseline-db.mjs";
import { buildLegacyIdentityPlan } from "../../tools/walking/legacy-identity-import.mjs";
import { legacyWalkingFixtures } from "../content/fixtures/legacy-walking-records.mjs";

const enabled = process.env.YIMI_RUN_WALKING_IDENTITY_INTEGRATION === "1";
const required = process.env.YIMI_REQUIRE_WALKING_IDENTITY_INTEGRATION === "1";
const databaseUrl = process.env.YIMI_WALKING_DATABASE_URL || "";

if (required && !enabled) throw new Error("WB2 PostgreSQL integration is required but disabled");
if (required && !databaseUrl) throw new Error("WB2 PostgreSQL integration requires YIMI_WALKING_DATABASE_URL");

const ACTIVE = "00000000-0000-4000-8000-000000009201";
const NON_ADMIN = "00000000-0000-4000-8000-000000009202";
const INACTIVE = "00000000-0000-4000-8000-000000009203";
const CONTENT_IDS = Array.from({ length: 15 }, (_, index) => `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`);
const YEARS = [115, 115, 115, 116, 112, 112, 112, 112, 112, 114, 114, 118, 118, 117, 119];
const PUBLIC_IDS = [
  "WB2-CLASS", "WB2-115-A", "WB2-115-B", "WB2-116-A",
  "112-002", "112-010", "112-011", "112-014", "WB2-112-NEXT",
  "114-018", "WB2-114-NEXT", "WB2-118-A", "WB2-118-B",
  "WB2-117-SAME", "WB2-119-CONSTRAINT",
];

function sqlText(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function directPsql(sql) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `psql exit ${result.status}`);
  return result.stdout.trim();
}

function executeTestSql(sql) {
  return databaseUrl ? directPsql(sql) : executeLocalSql(sql);
}

function queryTestJson(sql) {
  if (!databaseUrl) return queryLocalJson(sql);
  const output = directPsql(`select coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb)::text from (${sql}) result;`);
  return JSON.parse(output || "[]");
}

function asUser(userId, sql, { commit = false, raw = false } = {}) {
  const output = executeTestSql(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', ${sqlText(userId)}, true);
${raw ? sql : `select coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb)::text from (${sql}) result;`}
${commit ? "commit" : "rollback"};`).trim().split(/\r?\n/).filter((line) => line.startsWith("[")).at(-1);
  return JSON.parse(output || "[]");
}

function asAnonymous(sql) {
  return executeTestSql(`begin; set local role anon; ${sql}; rollback;`);
}

function runConcurrentAllocation(userId, contentId, holdSeconds = 0) {
  const sql = `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', ${sqlText(userId)}, true);
select public.get_or_create_activity_walking_identity(${sqlText(contentId)}::uuid);
select pg_sleep(${holdSeconds});
commit;`;
  const command = databaseUrl ? "psql" : "docker";
  const args = databaseUrl
    ? [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]
    : ["exec", "-i", "supabase_db_yimi-story-local", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || stdout || `${command} exit ${code}`));
      else resolve(stdout.split(/\r?\n/).find((line) => /^WR-/.test(line)));
    });
    child.stdin.end(sql);
  });
}

function fixtureItemsSql() {
  return CONTENT_IDS.map((id, index) => `(
    ${sqlText(id)}::uuid,
    ${index === 0 ? "'class_result'" : "'activity'"}::public.content_type,
    ${sqlText(PUBLIC_IDS[index])},
    ${sqlText(ACTIVE)}::uuid
  )`).join(",\n");
}

function fixtureDraftsSql() {
  return CONTENT_IDS.map((id, index) => `(
    ${sqlText(id)}::uuid,
    ${sqlText(id)}::uuid,
    1,
    'draft',
    ${sqlText(JSON.stringify({ year: YEARS[index], walkingRecord: null }))}::jsonb,
    '{"valid":false,"errors":[],"warnings":[]}'::jsonb,
    ${sqlText(ACTIVE)}::uuid,
    ${sqlText(ACTIVE)}::uuid
  )`).join(",\n");
}

function insertAuthFixtures() {
  if (databaseUrl) {
    executeTestSql(`insert into auth.users(id) values ('${ACTIVE}'),('${NON_ADMIN}'),('${INACTIVE}') on conflict (id) do nothing;`);
    return;
  }
  executeTestSql(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','${ACTIVE}','authenticated','authenticated','walking-active@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','${NON_ADMIN}','authenticated','authenticated','walking-user@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','${INACTIVE}','authenticated','authenticated','walking-inactive@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;`);
}

test("WB2 PostgreSQL identity RPC, RLS, importer, legacy sequence and concurrency", { skip: !enabled }, async () => {
  const fixtureIds = CONTENT_IDS.map((id) => `'${id}'`).join(",");
  executeTestSql(`delete from public.content_items where id in (${fixtureIds});
delete from public.admin_users where user_id in ('${ACTIVE}','${INACTIVE}');
delete from auth.users where id in ('${ACTIVE}','${NON_ADMIN}','${INACTIVE}');`);
  insertAuthFixtures();
  executeTestSql(`insert into public.admin_users(user_id,email,is_active) values
('${ACTIVE}','walking-active@example.test',true),('${INACTIVE}','walking-inactive@example.test',false)
on conflict (user_id) do update set is_active=excluded.is_active;
insert into public.content_items (id, content_type, public_id, created_by) values ${fixtureItemsSql()};
insert into public.content_drafts (id,content_id,revision,status,data,validation_result,created_by,updated_by)
values ${fixtureDraftsSql()};
insert into public.activity_walking_identities (content_id,walking_record_id,allocated_year,created_by) values
('${CONTENT_IDS[4]}','WR-112-001',112,'${ACTIVE}'),
('${CONTENT_IDS[5]}','WR-112-002',112,'${ACTIVE}'),
('${CONTENT_IDS[6]}','WR-112-003',112,'${ACTIVE}'),
('${CONTENT_IDS[7]}','WR-112-004',112,'${ACTIVE}'),
('${CONTENT_IDS[9]}','WR-114-001',114,'${ACTIVE}');`);

  try {
    assert.throws(() => asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid) value`), /content item not found/i);
    console.log("missing content blocked");
    assert.throws(() => asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[0]}'::uuid) value`), /requires activity content/i);
    console.log("non-activity blocked");
    assert.throws(() => asUser(NON_ADMIN, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[1]}'::uuid) value`), /active admin required/i);
    console.log("non-admin PASS");
    assert.throws(() => asUser(INACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[1]}'::uuid) value`), /active admin required/i);
    console.log("inactive admin PASS");
    assert.throws(() => asAnonymous(`select public.get_or_create_activity_walking_identity('${CONTENT_IDS[1]}'::uuid)`), /permission denied/i);
    console.log("anonymous PASS");

    const different = await Promise.all([
      runConcurrentAllocation(ACTIVE, CONTENT_IDS[1], 0.35),
      runConcurrentAllocation(ACTIVE, CONTENT_IDS[2]),
    ]);
    assert.deepEqual([...different].sort(), ["WR-115-001", "WR-115-002"]);
    assert.deepEqual(queryTestJson(`select walking_record_id from public.activity_walking_identities where allocated_year=115 order by walking_record_id`).map((row) => row.walking_record_id), ["WR-115-001", "WR-115-002"]);
    console.log("different-activity concurrency PASS");
    console.log("active admin PASS");
    const reused = asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[1]}'::uuid) value`, { commit: true });
    assert.equal(reused[0].value, different[0]);
    const created = queryTestJson(`select created_by::text created_by from public.activity_walking_identities where content_id='${CONTENT_IDS[1]}'`)[0];
    assert.equal(created.created_by, ACTIVE);
    console.log("created_by PASS");

    executeTestSql(`update public.content_drafts set data=jsonb_set(data,'{walkingRecord}','{"type":"地方走讀"}'::jsonb), updated_by='${ACTIVE}' where content_id='${CONTENT_IDS[1]}';
      update public.content_drafts set data=jsonb_set(data,'{walkingRecord}','null'::jsonb), updated_by='${ACTIVE}' where content_id='${CONTENT_IDS[1]}';
    `);
    const reopened = asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[1]}'::uuid) value`, { commit: true });
    assert.equal(reopened[0].value, different[0]);
    assert.equal(queryTestJson(`select count(*)::integer count from public.activity_walking_identities where content_id='${CONTENT_IDS[1]}'`)[0].count, 1);
    const otherYear = asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[3]}'::uuid) value`, { commit: true });
    assert.equal(otherYear[0].value, "WR-116-001");

    executeTestSql(`update public.content_drafts set data=jsonb_set(data,'{year}','116'::jsonb), updated_by='${ACTIVE}' where content_id='${CONTENT_IDS[1]}';`);
    const yearChanged = asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[1]}'::uuid) value`, { commit: true });
    assert.equal(yearChanged[0].value, different[0]);
    assert.deepEqual(queryTestJson(`select walking_record_id,allocated_year,created_by::text created_by from public.activity_walking_identities where content_id='${CONTENT_IDS[1]}'`)[0], {
      walking_record_id: different[0], allocated_year: 115, created_by: ACTIVE,
    });
    console.log("year-change PASS");

    const legacy112 = asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[8]}'::uuid) value`, { commit: true });
    const legacy114 = asUser(ACTIVE, `select public.get_or_create_activity_walking_identity('${CONTENT_IDS[10]}'::uuid) value`, { commit: true });
    assert.equal(legacy112[0].value, "WR-112-005");
    assert.equal(legacy114[0].value, "WR-114-002");
    console.log("legacy 112 PASS");
    console.log("legacy 114 PASS");

    const same = await Promise.all([
      runConcurrentAllocation(ACTIVE, CONTENT_IDS[13], 0.35),
      runConcurrentAllocation(ACTIVE, CONTENT_IDS[13]),
    ]);
    assert.deepEqual(same, ["WR-117-001", "WR-117-001"]);
    assert.equal(queryTestJson(`select count(*)::integer count from public.activity_walking_identities where content_id='${CONTENT_IDS[13]}'`)[0].count, 1);
    console.log("same-activity concurrency PASS");

    assert.throws(() => asUser(ACTIVE, `insert into public.activity_walking_identities(content_id,walking_record_id,allocated_year,created_by) values ('${CONTENT_IDS[14]}','WR-119-001',119,'${ACTIVE}'); select '[]'::text`, { raw: true }), /permission denied|row-level security/i);
    console.log("direct INSERT blocked");
    assert.throws(() => asUser(ACTIVE, `update public.activity_walking_identities set allocated_year=119 where content_id='${CONTENT_IDS[1]}'; select '[]'::text`, { raw: true }), /permission denied|row-level security/i);
    console.log("direct UPDATE blocked");
    assert.throws(() => asUser(ACTIVE, `delete from public.activity_walking_identities where content_id='${CONTENT_IDS[1]}'; select '[]'::text`, { raw: true }), /permission denied|row-level security/i);
    console.log("direct DELETE blocked");
    assert.equal(asUser(ACTIVE, `select walking_record_id from public.activity_walking_identities where content_id='${CONTENT_IDS[1]}'`)[0].walking_record_id, different[0]);
    assert.equal(asUser(NON_ADMIN, `select walking_record_id from public.activity_walking_identities`).length, 0);
    assert.equal(asUser(INACTIVE, `select walking_record_id from public.activity_walking_identities`).length, 0);

    const fixturePublicIds = legacyWalkingFixtures.map((fixture) => sqlText(fixture.activityPublicId)).join(",");
    const contentItems = queryTestJson(`select id::text id,content_type::text content_type,public_id from public.content_items where public_id in (${fixturePublicIds}) order by public_id`);
    const existingIdentities = queryTestJson(`select content_id::text,walking_record_id,allocated_year from public.activity_walking_identities where content_id in (select id from public.content_items where public_id in (${fixturePublicIds})) order by walking_record_id`);
    const importPlan = buildLegacyIdentityPlan({ fixtures: legacyWalkingFixtures, contentItems, existingIdentities });
    assert.equal(importPlan.canApply, true);
    assert.equal(importPlan.planned.length, 0);
    assert.equal(importPlan.skipped.length, 5);
    console.log("legacy importer dry-run PASS");

    assert.throws(() => executeTestSql(`insert into public.activity_walking_identities(content_id,walking_record_id,allocated_year,created_by) values ('${CONTENT_IDS[1]}','WR-115-099',115,'${ACTIVE}')`), /duplicate key/i);
    assert.throws(() => executeTestSql(`insert into public.activity_walking_identities(content_id,walking_record_id,allocated_year,created_by) values ('${CONTENT_IDS[14]}','WR-115-001',115,'${ACTIVE}')`), /duplicate key/i);
    assert.throws(() => executeTestSql(`insert into public.activity_walking_identities(content_id,walking_record_id,allocated_year,created_by) values ('${CONTENT_IDS[14]}','BAD-115-001',115,'${ACTIVE}')`), /check constraint/i);
    assert.throws(() => executeTestSql(`insert into public.activity_walking_identities(content_id,walking_record_id,allocated_year,created_by) values ('${CONTENT_IDS[14]}','WR-099-001',99,'${ACTIVE}')`), /check constraint/i);
    assert.throws(() => executeTestSql(`insert into public.activity_walking_identities(content_id,walking_record_id,allocated_year,created_by) values ('${CONTENT_IDS[14]}','WR-119-001',118,'${ACTIVE}')`), /check constraint/i);
  } finally {
    executeTestSql(`delete from public.activity_walking_identities where content_id in (${fixtureIds});
delete from public.content_drafts where content_id in (${fixtureIds});
delete from public.content_items where id in (${fixtureIds});
delete from public.admin_users where user_id in ('${ACTIVE}','${INACTIVE}');
delete from auth.users where id in ('${ACTIVE}','${NON_ADMIN}','${INACTIVE}');`);
  }
});
