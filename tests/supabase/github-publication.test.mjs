import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildFormalPublication, FORMAL_FILE_ALLOWLIST, generateActivitiesDataJs, parseCsv, sha256Hex,
} from "../../supabase/functions/_shared/formal-publication.ts";
import { GitHubPublicationClient, publicationBranchName } from "../../supabase/functions/_shared/github-publication.ts";
import { createPrepareGitHubPublicationHandler } from "../../supabase/functions/prepare-github-publication/handler.ts";

const root = new URL("../../", import.meta.url);
const baselineFiles = Object.fromEntries(await Promise.all(FORMAL_FILE_ALLOWLIST.map(async (path) => [path, await readFile(new URL(path, root), "utf8")])));
const media = {
  snapshotMediaManifest: [{ mediaId: "media-cover", role: "cover", sortOrder: 0, source: "github_legacy", legacyPath: "public/images/demo.jpg" }],
  publicMediaManifest: [{ sourceMediaId: "media-cover", publicMediaId: null, role: "cover", sortOrder: 0, publicSource: "github_legacy", publicPath: "public/images/demo.jpg", sha256: null, metadata: { altText: "封面" } }],
};
const classData = {
  id: "CR-115-999", year: 115, title: "正式輸出測試", className: "測試課程", instructor: "講師",
  description: "摘要", districts: ["水上鄉"], venue: "測試地點", tags: ["測試"], sdgs: ["SDG 4"], displayOrder: 999, publicNotes: "公開",
};

function build(extra = {}) {
  return buildFormalPublication({ contentType: "class_result", publicId: classData.id, publicData: { ...classData, ...extra },
    ...media, publicStorageBaseUrl: "https://example.supabase.co/storage/v1/object/public/cms-public", baselineFiles });
}

test("formal publication only emits the six-file allowlist and increments class count", () => {
  const result = build();
  assert.deepEqual(Object.keys(result.files).sort(), [...FORMAL_FILE_ALLOWLIST].sort());
  assert.equal(result.changeType, "new");
  assert.deepEqual(result.beforeCounts, { classResults: 56, activities: 63 });
  assert.deepEqual(result.afterCounts, { classResults: 57, activities: 63 });
  assert.deepEqual(result.changedFiles.sort(), ["data/class-results-data.js", "data/class-results.json"].sort());
});

test("formal exporter is deterministic and rejects internal fields", async () => {
  const first = build(); const second = build();
  for (const path of FORMAL_FILE_ALLOWLIST) assert.equal(await sha256Hex(first.files[path]), await sha256Hex(second.files[path]));
  assert.throws(() => build({ internalNotes: "secret" }), /INTERNAL_NOTES_LEAK/u);
});

test("activity CSV is RFC 4180 CRLF and fallback contains the exact rows", () => {
  const rows = parseCsv(baselineFiles["activities.csv"]);
  const csv = baselineFiles["activities.csv"].replace(/\r?\n/gu, "\r\n");
  assert.equal(parseCsv(csv).length, rows.length);
  assert.ok(!generateActivitiesDataJs(csv).includes("\r\n"));
});

test("publication branch name is deterministic and constrained", () => {
  assert.equal(publicationBranchName("class_result", "CR-115-999", "a".repeat(64)), "publication/class-result/CR-115-999/aaaaaaaaaaaa");
  assert.throws(() => publicationBranchName("class_result", "x", "bad"), /BRANCH_NAME_INVALID/u);
});

test("GitHub adapter hard-codes repo, uses draft PR, and exposes no merge method", async () => {
  const requests = [];
  const fetcher = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.endsWith("/access_tokens")) return Response.json({ token: "temporary-installation-token" });
    if (url.endsWith("/pulls")) return Response.json({ number: 27, html_url: "https://github.com/yimi-Tian/yimi-story/pull/27" }, { status: 201 });
    throw new Error(`unexpected ${url}`);
  };
  const client = new GitHubPublicationClient({ appId: "1", installationId: "2", privateKey: "unused", owner: "yimi-Tian", repository: "yimi-story" }, fetcher);
  client.token = "temporary-installation-token";
  const result = await client.createDraftPullRequest({ branch: "publication/class-result/CR-115-999/aaaaaaaaaaaa", title: "title", body: "body" });
  assert.equal(result.number, 27);
  const body = JSON.parse(requests.at(-1).init.body);
  assert.equal(body.draft, true); assert.equal(body.base, "main");
  assert.equal(typeof client.mergePullRequest, "undefined");
  assert.ok(!JSON.stringify(result).includes("temporary-installation-token"));
});

test("Edge handler rejects forged server-managed fields and inactive users", async () => {
  const allowed = "https://yimi-story-admin.pages.dev";
  const active = createPrepareGitHubPublicationHandler(allowed, {
    verify: async () => ({ status: "active", userId: "admin" }), execute: async () => ({ status: "dry_run_ready" }),
  });
  const forged = await active(new Request("https://edge.test", { method: "POST", headers: { origin: allowed, authorization: "Bearer safe", "content-type": "application/json" }, body: JSON.stringify({ action: "dry_run", snapshotId: "11111111-1111-4111-8111-111111111111", repository: "other" }) }));
  assert.equal(forged.status, 400); assert.equal((await forged.json()).error, "server_managed_fields_only");
  const inactive = createPrepareGitHubPublicationHandler(allowed, { verify: async () => ({ status: "inactive" }), execute: async () => ({}) });
  const denied = await inactive(new Request("https://edge.test", { method: "POST", headers: { origin: allowed, authorization: "Bearer safe", "content-type": "application/json" }, body: JSON.stringify({ action: "dry_run", snapshotId: "11111111-1111-4111-8111-111111111111" }) }));
  assert.equal(denied.status, 403);
});
