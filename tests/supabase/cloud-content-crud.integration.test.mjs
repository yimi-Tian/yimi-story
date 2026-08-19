import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "../../admin/node_modules/@supabase/supabase-js/dist/index.mjs";
import { normalizeClassResult } from "../../tools/content/normalize-class-result.mjs";

const CONTENT_EDIT_SELECT = `
  id,
  content_type,
  public_id,
  published_snapshot_id,
  updated_at,
  drafts:content_drafts(id, revision, status, data, validation_result, updated_at),
  published:publication_snapshots!content_items_published_snapshot_id_fkey(id, snapshot_data, created_at),
  media:media_assets(id)
`;

const enabled = process.env.YIMI_RUN_CLOUD_CONTENT_CRUD === "1";

function client(url, key, observedResponses = null) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: observedResponses ? { fetch: async (input, init) => {
      const response = await fetch(input, init);
      observedResponses.push({ path: new URL(typeof input === "string" ? input : input.url).pathname, status: response.status });
      return response;
    } } : undefined,
  });
}

async function counts(service) {
  const exact = async (table, configure = (query) => query) => {
    const { count, error } = await configure(service.from(table).select("id", { count: "exact", head: true }));
    if (error) throw error;
    return count ?? 0;
  };
  return {
    items: await exact("content_items"), drafts: await exact("content_drafts"),
    snapshots: await exact("publication_snapshots"), media: await exact("media_assets"),
    publications: await exact("github_publications"),
  };
}

test("production Cloud Stage 5B-1 CRUD 與 RLS，以臨時內容完整清理", { skip: !enabled, timeout: 120_000 }, async () => {
  const url = process.env.YIMI_CLOUD_SUPABASE_URL;
  const publishable = process.env.YIMI_CLOUD_PUBLISHABLE_KEY;
  const serviceKey = process.env.YIMI_CLOUD_SERVICE_ROLE_KEY;
  assert.ok(url && publishable && serviceKey, "Cloud integration env missing");
  const service = client(url, serviceKey);
  const before = await counts(service);
  const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const identities = ["active", "user", "inactive"].map((role) => ({ role, email: `crud-${role}-${suffix}@example.test`, id: null }));
  const createdContentIds = [];
  const baselineDraftIds = [];
  const activeResponses = [];

  try {
    for (const identity of identities) {
      const { data, error } = await service.auth.admin.createUser({ email: identity.email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("AUTH_CREATE_FAILED");
      identity.id = data.user.id;
    }
    const { error: adminError } = await service.from("admin_users").insert([
      { user_id: identities[0].id, email: identities[0].email, is_active: true },
      { user_id: identities[2].id, email: identities[2].email, is_active: false },
    ]);
    if (adminError) throw adminError;

    const signed = {};
    for (const identity of identities) {
      const authClient = client(url, publishable, identity.role === "active" ? activeResponses : null);
      const { error } = await authClient.auth.signInWithPassword({ email: identity.email, password });
      if (error) throw error;
      signed[identity.role] = authClient;
    }
    const anonymous = client(url, publishable);

    const baselineItems = [];
    for (const publicId of ["CR-115-056", "CR-115-055"]) {
      const existing = await signed.active.from("content_items").select(CONTENT_EDIT_SELECT)
        .eq("content_type", "class_result").eq("public_id", publicId).single();
      assert.equal(existing.error, null, `${publicId} edit query failed: ${existing.error?.code ?? "unknown"}`);
      assert.equal(existing.data?.public_id, publicId);
      assert.ok(existing.data?.published_snapshot_id);
      assert.ok(existing.data?.published?.snapshot_data);
      assert.equal(existing.data?.drafts, null);
      const canonical = normalizeClassResult(existing.data.published.snapshot_data).data;
      assert.equal(canonical.id, publicId);
      assert.ok(Array.isArray(canonical.districts));
      assert.ok(Array.isArray(canonical.tags));
      assert.ok(Array.isArray(canonical.sdgs));
      baselineItems.push(existing.data);
    }
    for (const item of baselineItems) {
      const opened = await signed.active.rpc("get_or_create_content_draft", { p_content_id: item.id });
      assert.equal(opened.error, null, `${item.public_id} first edit failed: ${opened.error?.code ?? "unknown"}`);
      assert.equal(opened.data?.revision, 1);
      assert.equal(opened.data?.status, "draft");
      baselineDraftIds.push(opened.data.id);
    }
    const reopened = await signed.active.rpc("get_or_create_content_draft", { p_content_id: baselineItems[0].id });
    assert.equal(reopened.error, null);
    assert.equal(reopened.data?.id, baselineDraftIds[0]);
    assert.ok(activeResponses.some(({ path, status }) => path.endsWith("/rest/v1/content_items") && status === 200));
    assert.ok(activeResponses.some(({ path, status }) => path.endsWith("/rest/v1/rpc/get_or_create_content_draft") && status === 200));

    for (const denied of [anonymous, signed.user, signed.inactive]) {
      const { data, error } = await denied.from("content_items").select("id");
      if (error) {
        assert.equal(error.code, "42501");
      } else {
        assert.deepEqual(data, []);
      }
      const attempted = await denied.rpc("create_content_with_draft", { p_content_type: "activity", p_year: 197, p_data: {}, p_validation_result: {} });
      assert.ok(attempted.error);
    }

    const create = async (type) => {
      const { data, error } = await signed.active.rpc("create_content_with_draft", {
        p_content_type: type, p_year: 197,
        p_data: { year: 197, internalNotes: "cloud integration only", publicNotes: null },
        p_validation_result: { valid: false, errors: [], warnings: [] },
      });
      if (error) throw error;
      const row = data[0]; createdContentIds.push(row.content_id); return row;
    };
    const classItem = await create("class_result");
    const activityItem = await create("activity");
    assert.match(classItem.public_id, /^CR-197-\d{3}$/);
    assert.match(activityItem.public_id, /^197-\d{3}$/);
    const concurrent = await Promise.all([create("class_result"), create("class_result")]);
    assert.notEqual(concurrent[0].public_id, concurrent[1].public_id);

    const valid = await signed.active.from("content_drafts").update({
      status: "validated", data: { id: classItem.public_id, year: 197, internalNotes: "safe" },
      validation_result: { valid: true, errors: [], warnings: [] }, updated_by: identities[0].id,
    }).eq("id", classItem.draft_id).select("revision,status,validation_result,updated_by").single();
    assert.equal(valid.error, null); assert.equal(valid.data.revision, 2); assert.equal(valid.data.status, "validated");
    const invalid = await signed.active.from("content_drafts").update({
      status: "draft", data: { id: classItem.public_id, year: 197, internalNotes: "safe", title: "" },
      validation_result: { valid: false, errors: [{ field: "title", code: "required", message: "required" }], warnings: [] }, updated_by: identities[0].id,
    }).eq("id", classItem.draft_id).select("revision,status,validation_result").single();
    assert.equal(invalid.error, null); assert.equal(invalid.data.revision, 3); assert.equal(invalid.data.status, "draft");

    const during = await counts(service);
    assert.deepEqual({ snapshots: during.snapshots, media: during.media, publications: during.publications }, { snapshots: before.snapshots, media: before.media, publications: before.publications });
    assert.equal(during.items, before.items + 4);
    assert.equal(during.drafts, before.drafts + 4 + baselineDraftIds.length);
  } finally {
    if (baselineDraftIds.length) await service.from("content_drafts").delete().in("id", baselineDraftIds);
    if (createdContentIds.length) {
      await service.from("content_drafts").delete().in("content_id", createdContentIds);
      await service.from("content_items").delete().in("id", createdContentIds);
    }
    const ids = identities.map((identity) => identity.id).filter(Boolean);
    if (ids.length) await service.from("admin_users").delete().in("user_id", ids);
    for (const id of ids) await service.auth.admin.deleteUser(id);
  }

  assert.deepEqual(await counts(service), before);
});
