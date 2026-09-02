import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./contract-helpers.mjs";

const sql = read("supabase/migrations/202609020002_github_publication_workflow.sql");
const prepare = read("supabase/functions/prepare-github-publication/index.ts");
const finalize = read("supabase/functions/finalize-github-publication/index.ts");
const github = read("supabase/functions/_shared/github-publication.ts");

test("Stage 7C additive workflow reuses github_publications and preserves human merge", () => {
  assert.doesNotMatch(sql, /create\s+table\s+public\.github_publications/iu);
  assert.match(sql, /add column formal_manifest jsonb/iu);
  assert.match(sql, /dry_run_ready/iu);
  assert.match(sql, /deploy_pending/iu);
  assert.match(sql, /finalized/iu);
  assert.doesNotMatch(`${prepare}\n${finalize}\n${github}`, /mergePullRequest|\/merges|method:\s*["']PUT["']/u);
});

test("browser is read-only and service RPC owns publication state and pointer", () => {
  assert.match(sql, /revoke insert, update, delete on table public\.github_publications from anon, authenticated/iu);
  assert.match(sql, /grant select on table public\.github_publications to authenticated/iu);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/iu);
  assert.match(sql, /published_snapshot_id is distinct from v_publication\.expected_published_snapshot_id/iu);
  assert.match(sql, /update public\.content_items set published_snapshot_id = v_publication\.snapshot_id/iu);
});

test("formal write scope is six files and GitHub identity is fixed server-side", () => {
  assert.match(prepare, /FORMAL_FILE_ALLOWLIST/iu);
  assert.match(prepare, /repositoryOwner: GITHUB_OWNER/iu);
  assert.match(prepare, /function canonical\(value: unknown\)/u);
  assert.match(sql, /repositoryOwner' <> 'yimi-Tian'/iu);
  assert.match(sql, /repositoryName' <> 'yimi-story'/iu);
  assert.match(sql, /baseBranch' <> 'main'/iu);
  assert.doesNotMatch(prepare, /public\/images|public\/docs/iu);
});

test("Stage 7C only accepts snapshot 1.1 and ready frozen media preparation", () => {
  assert.match(prepare, /snapshot\.schema_version !== "1\.1"/u);
  assert.match(prepare, /preparation\.public_manifest/u);
  assert.doesNotMatch(prepare, /from\("media_assets"\)/u);
  assert.match(sql, /v_snapshot\.schema_version <> '1\.1'/u);
  assert.match(sql, /status = 'ready'/u);
});

test("finalization requires merged PR, main checksums, Pages bytes, and pointer race guard", () => {
  assert.match(finalize, /!pr\.merged/iu);
  assert.match(finalize, /github\.readFile\(file\.path, "main"\)/u);
  assert.match(finalize, /getPagesDeploymentStatus/iu);
  assert.match(finalize, /finalize_github_publication/iu);
});
