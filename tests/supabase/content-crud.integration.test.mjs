import test from "node:test";
import assert from "node:assert/strict";
import { applyBaselinePlan, executeLocalSql, queryLocalJson } from "../../tools/baseline/baseline-db.mjs";
import { buildStage3HistoricalBaselinePlan } from "./stage3-historical-fixture.mjs";

const enabled = process.env.YIMI_RUN_CONTENT_CRUD_INTEGRATION === "1";
const ACTIVE = "00000000-0000-4000-8000-000000000501";
const NON_ADMIN = "00000000-0000-4000-8000-000000000502";
const INACTIVE = "00000000-0000-4000-8000-000000000503";

function sqlText(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function asUser(userId, sql, { commit = false, raw = false } = {}) {
  const output = executeLocalSql(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', ${sqlText(userId)}, true);
${raw ? sql : `select coalesce(json_agg(result), '[]'::json)::text from (${sql}) result;`}
${commit ? "commit" : "rollback"};`).trim().split(/\r?\n/).filter((line) => line.startsWith("[")).at(-1);
  return JSON.parse(output);
}

test("Stage 5B-1 local CRUD RPC、revision 與 RLS 實測", { skip: !enabled }, async () => {
  applyBaselinePlan(await buildStage3HistoricalBaselinePlan());
  executeLocalSql(`
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','${ACTIVE}','authenticated','authenticated','crud-active@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','${NON_ADMIN}','authenticated','authenticated','crud-user@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','${INACTIVE}','authenticated','authenticated','crud-inactive@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;
insert into public.admin_users(user_id,email,is_active) values
('${ACTIVE}','crud-active@example.test',true),('${INACTIVE}','crud-inactive@example.test',false)
on conflict (user_id) do update set is_active=excluded.is_active;`);

  try {
    const first = asUser(ACTIVE, `select id, content_id, revision, status::text, data
      from public.get_or_create_content_draft((select id from public.content_items where public_id='CR-115-003'))`, { commit: true });
    const second = asUser(ACTIVE, `select id, content_id, revision, status::text, data
      from public.get_or_create_content_draft((select id from public.content_items where public_id='CR-115-003'))`, { commit: true });
    assert.equal(first[0].id, second[0].id);
    assert.equal(first[0].revision, 1);
    assert.equal(first[0].data.internalNotes, "3個朴子班級合併呈現");
    assert.equal(queryLocalJson(`select count(*)::integer count from public.content_drafts where content_id=(select id from public.content_items where public_id='CR-115-003')`)[0].count, 1);

    const classCreated = asUser(ACTIVE, `select * from public.create_content_with_draft('class_result',199,'{"year":199,"title":"測試"}'::jsonb,'{"valid":false,"errors":[],"warnings":[]}'::jsonb)`, { commit: true });
    const activityCreated = asUser(ACTIVE, `select * from public.create_content_with_draft('activity',199,'{"year":199,"name":"測試"}'::jsonb,'{"valid":false,"errors":[],"warnings":[]}'::jsonb)`, { commit: true });
    assert.equal(classCreated[0].public_id, "CR-199-001");
    assert.equal(activityCreated[0].public_id, "199-001");
    assert.equal(queryLocalJson(`select count(*)::integer count from public.content_items where public_id in ('CR-199-001','199-001') and published_snapshot_id is null`)[0].count, 2);

    const saved = asUser(ACTIVE, `with updated as (update public.content_drafts set status='validated', data=data||'{"internalNotes":"safe"}'::jsonb,
      validation_result='{"valid":true,"errors":[],"warnings":[]}'::jsonb, updated_by='${ACTIVE}' where id='${classCreated[0].draft_id}'
      returning revision,status,validation_result,updated_by)
      select coalesce(json_agg(result), '[]'::json)::text from (select revision,status::text,validation_result,updated_by from updated) result;`, { commit: true, raw: true });
    assert.equal(saved[0].revision, 2);
    assert.equal(saved[0].status, "validated");
    assert.equal(saved[0].updated_by, ACTIVE);
    const downgraded = asUser(ACTIVE, `with updated as (update public.content_drafts set status='draft', data=data||'{"title":"changed"}'::jsonb,
      validation_result='{"valid":false,"errors":[{"field":"title","code":"test","message":"required"}],"warnings":[]}'::jsonb, updated_by='${ACTIVE}' where id='${classCreated[0].draft_id}'
      returning revision,status,validation_result)
      select coalesce(json_agg(result), '[]'::json)::text from (select revision,status::text,validation_result from updated) result;`, { commit: true, raw: true });
    assert.equal(downgraded[0].revision, 3);
    assert.equal(downgraded[0].status, "draft");
    assert.equal(downgraded[0].validation_result.valid, false);

    for (const denied of [NON_ADMIN, INACTIVE]) {
      assert.throws(() => asUser(denied, `select * from public.create_content_with_draft('activity',198,'{}','{}')`), /active admin required|row-level security/i);
    }
  } finally {
    executeLocalSql(`delete from public.content_drafts where content_id in (select id from public.content_items where public_id in ('CR-115-003','CR-199-001','199-001'));
delete from public.content_items where public_id in ('CR-199-001','199-001');
delete from public.admin_users where user_id in ('${ACTIVE}','${INACTIVE}');
delete from auth.users where id in ('${ACTIVE}','${NON_ADMIN}','${INACTIVE}');`);
  }

  assert.equal(queryLocalJson(`select count(*)::integer count from public.content_drafts`)[0].count, 0);
  assert.equal(queryLocalJson(`select count(*)::integer count from public.publication_snapshots`)[0].count, 119);
  assert.equal(queryLocalJson(`select count(*)::integer count from public.media_assets`)[0].count, 714);
});
