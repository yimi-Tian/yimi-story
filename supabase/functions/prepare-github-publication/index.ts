import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import { DEFAULT_LOCAL_ADMIN_ORIGIN } from "../_shared/cors.ts";
import {
  buildFormalPublication, FORMAL_FILE_ALLOWLIST, sha256Hex, type FormalFilePath,
} from "../_shared/formal-publication.ts";
import {
  GITHUB_BASE_BRANCH, GITHUB_OWNER, GITHUB_REPOSITORY, GitHubPublicationClient,
  githubCredentialsFromEnv, publicationBranchName,
} from "../_shared/github-publication.ts";
import { createPrepareGitHubPublicationHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN") ?? DEFAULT_LOCAL_ADMIN_ORIGIN;
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const github = new GitHubPublicationClient(githubCredentialsFromEnv());

class PublicationError extends Error {}
const fail = (code: string): never => { throw new PublicationError(code); };
const row = (value: unknown): Record<string, unknown> => Array.isArray(value) ? value[0] : value as Record<string, unknown>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function summary(value: Record<string, unknown>) {
  const manifest = value.formal_manifest as Record<string, unknown> | null;
  return {
    id: String(value.id), snapshotId: String(value.snapshot_id), status: String(value.pr_state),
    branch: String(value.head_branch), baseSha: String(value.base_sha), commitSha: value.commit_sha ? String(value.commit_sha) : null,
    prNumber: value.pr_number ? Number(value.pr_number) : null, prUrl: value.pr_url ? String(value.pr_url) : null,
    changedFiles: Array.isArray(manifest?.changedFiles) ? manifest.changedFiles : [],
    beforeCounts: manifest?.beforeCounts ?? null, afterCounts: manifest?.afterCounts ?? null,
    checkedAt: value.checked_at ? String(value.checked_at) : null, errorCode: value.error_code ? String(value.error_code) : null,
  };
}

async function verify(token: string) {
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return { status: "invalid" as const };
  const admin = await service.from("admin_users").select("is_active").eq("user_id", data.user.id).maybeSingle();
  if (admin.error) throw new Error("admin_lookup_failed");
  return admin.data ? { status: admin.data.is_active ? "active" as const : "inactive" as const, userId: data.user.id }
    : { status: "not_admin" as const };
}

async function publication(snapshotId: string): Promise<Record<string, unknown> | null> {
  const result = await service.from("github_publications").select("*").eq("snapshot_id", snapshotId).maybeSingle();
  if (result.error) fail("PUBLICATION_READ_FAILED");
  return result.data as Record<string, unknown> | null;
}

async function source(snapshotId: string) {
  const snapshotResult = await service.from("publication_snapshots")
    .select("id,content_id,source_revision,schema_version,public_data,media_manifest,checksum_sha256,status,snapshot_source,publication_validation")
    .eq("id", snapshotId).maybeSingle();
  if (snapshotResult.error) fail("SNAPSHOT_READ_FAILED");
  const snapshot = snapshotResult.data;
  if (!snapshot) fail("SNAPSHOT_NOT_FOUND");
  if (snapshot.schema_version !== "1.1" || snapshot.snapshot_source !== "draft" || snapshot.status !== "ready" || snapshot.publication_validation?.valid !== true) fail("SNAPSHOT_NOT_ELIGIBLE");
  const itemResult = await service.from("content_items").select("id,content_type,public_id").eq("id", snapshot.content_id).maybeSingle();
  if (itemResult.error || !itemResult.data) fail("CONTENT_NOT_FOUND");
  const prepResult = await service.from("publication_media_preparations")
    .select("publication_snapshot_id,status,public_manifest,manifest_checksum_sha256")
    .eq("publication_snapshot_id", snapshot.id).maybeSingle();
  if (prepResult.error || !prepResult.data || prepResult.data.status !== "ready") fail("MEDIA_NOT_READY");
  return { snapshot, item: itemResult.data, preparation: prepResult.data };
}

async function generate(snapshotId: string) {
  const { snapshot, item, preparation } = await source(snapshotId);
  await github.getRepository();
  const baseSha = await github.getDefaultBranchRef();
  const baselineFiles = await github.readFormalFiles(baseSha);
  let output;
  try {
    output = buildFormalPublication({
      contentType: item.content_type, publicId: item.public_id, publicData: snapshot.public_data,
      snapshotMediaManifest: snapshot.media_manifest, publicMediaManifest: preparation.public_manifest,
      publicStorageBaseUrl: `${url}/storage/v1/object/public/cms-public`, baselineFiles,
    });
  } catch { fail("FORMAL_EXPORT_INVALID"); }
  const files = await Promise.all(FORMAL_FILE_ALLOWLIST.map(async (path) => ({
    path, sha256: await sha256Hex(output.files[path]), byteSize: new TextEncoder().encode(output.files[path]).length,
    changed: output.changedFiles.includes(path),
  })));
  const branch = publicationBranchName(item.content_type, item.public_id, snapshot.checksum_sha256);
  const formalManifest = {
    schemaVersion: "1.0", repositoryOwner: GITHUB_OWNER, repositoryName: GITHUB_REPOSITORY,
    baseBranch: GITHUB_BASE_BRANCH, baseSha, snapshotId: snapshot.id, snapshotRevision: snapshot.source_revision,
    snapshotChecksum: snapshot.checksum_sha256, mediaManifestVersion: "1.1",
    mediaPreparationId: preparation.publication_snapshot_id,
    mediaManifestChecksum: preparation.manifest_checksum_sha256,
    contentType: item.content_type, publicId: item.public_id, changeType: output.changeType,
    changedFiles: output.changedFiles, beforeCounts: output.beforeCounts, afterCounts: output.afterCounts,
    files,
  };
  return { snapshot, item, preparation, baseSha, baselineFiles, output, files, branch, formalManifest };
}

async function dryRun(snapshotId: string, userId: string) {
  const generated = await generate(snapshotId);
  const begun = await service.rpc("begin_github_publication", {
    p_actor_id: userId, p_snapshot_id: snapshotId, p_base_sha: generated.baseSha,
    p_head_branch: generated.branch, p_formal_manifest: generated.formalManifest,
  });
  if (begun.error || !begun.data) {
    if (begun.error?.code === "23505") fail("ACTIVE_PUBLICATION_EXISTS");
    fail("PUBLICATION_IDENTITY_CONFLICT");
  }
  return summary(row(begun.data));
}

async function createDraftPr(snapshotId: string, userId: string) {
  const current = await publication(snapshotId);
  if (!current) fail("PUBLICATION_NOT_FOUND");
  if (current.pr_number) return summary(current);
  if (current.pr_state !== "dry_run_ready" && current.pr_state !== "branch_created") fail("PUBLICATION_STATE_INVALID");
  const generated = await generate(snapshotId);
  if (generated.baseSha !== current.base_sha || canonical(generated.formalManifest) !== canonical(current.formal_manifest)) fail("MAIN_CHANGED");
  const changed = Object.fromEntries(generated.output.changedFiles.map((path: FormalFilePath) => [path, generated.output.files[path]]));
  let commitSha = await github.getBranchRef(generated.branch);
  if (!commitSha) {
    commitSha = await github.createCommitAndBranch({ branch: generated.branch, baseSha: generated.baseSha,
      message: `發布${generated.item.content_type === "class_result" ? "班級成果" : "活動成果"}：${generated.item.public_id}`,
      files: changed });
    const marked = await service.rpc("set_github_publication_state", { p_actor_id: userId, p_publication_id: current.id, p_state: "branch_created" });
    if (marked.error) fail("PUBLICATION_STATE_WRITE_FAILED");
  }
  let pr = await github.findPullRequest(generated.branch);
  if (pr && pr.state !== "open") fail("PULL_REQUEST_CONFLICT");
  if (!pr) pr = await github.createDraftPullRequest({
    branch: generated.branch,
    title: `發布${generated.item.content_type === "class_result" ? "班級成果" : "活動成果"}：${generated.item.public_id}`,
    body: `此為後台建立的 Draft PR，必須由管理員人工檢查與合併。\n\n- Public ID: ${generated.item.public_id}\n- Snapshot: ${generated.snapshot.checksum_sha256.slice(0, 12)}\n- 變更檔案：${generated.output.changedFiles.length}\n- 圖片：只引用既有公開路徑，PR 不含圖片檔。`,
  });
  const recorded = await service.rpc("record_github_publication_pr", {
    p_actor_id: userId, p_publication_id: current.id, p_commit_sha: commitSha,
    p_pr_number: pr.number, p_pr_url: pr.url,
  });
  if (recorded.error || !recorded.data) fail("PUBLICATION_STATE_WRITE_FAILED");
  return summary(row(recorded.data));
}

async function refresh(snapshotId: string, userId: string) {
  const current = await publication(snapshotId);
  if (!current) fail("PUBLICATION_NOT_FOUND");
  if (!current.pr_number) return summary(current);
  const pr = await github.getPullRequest(Number(current.pr_number));
  if (!pr.merged) return summary(current);
  if (!pr.mergeCommitSha) fail("MERGE_COMMIT_MISSING");
  let changed = await service.rpc("set_github_publication_state", {
    p_actor_id: userId, p_publication_id: current.id, p_state: "deploy_pending", p_merge_commit_sha: pr.mergeCommitSha,
  });
  if (changed.error) fail("PUBLICATION_STATE_WRITE_FAILED");
  const files = ((current.formal_manifest as Record<string, unknown>).files as Array<{ path: FormalFilePath; sha256: string }>).filter((file) => file.changed);
  const deployed = await github.getPagesDeploymentStatus(files);
  if (deployed === "deployed") {
    changed = await service.rpc("set_github_publication_state", {
      p_actor_id: userId, p_publication_id: current.id, p_state: "deployed", p_merge_commit_sha: pr.mergeCommitSha,
    });
    if (changed.error) fail("PUBLICATION_STATE_WRITE_FAILED");
  }
  return summary(row(changed.data));
}

async function cancel(snapshotId: string, userId: string) {
  const current = await publication(snapshotId);
  if (!current) fail("PUBLICATION_NOT_FOUND");
  if (["merged", "deploy_pending", "deployed", "finalized"].includes(String(current.pr_state))) fail("PUBLICATION_NOT_CANCELLABLE");
  if (current.pr_number) await github.closePullRequest(Number(current.pr_number));
  await github.deletePublicationBranch(String(current.head_branch));
  const result = await service.rpc("set_github_publication_state", {
    p_actor_id: userId, p_publication_id: current.id, p_state: "cancelled",
  });
  if (result.error || !result.data) fail("PUBLICATION_STATE_WRITE_FAILED");
  return summary(row(result.data));
}

Deno.serve(createPrepareGitHubPublicationHandler(allowedOrigin, {
  verify,
  execute(action, snapshotId, userId) {
    if (action === "dry_run") return dryRun(snapshotId, userId);
    if (action === "create_draft_pr") return createDraftPr(snapshotId, userId);
    if (action === "refresh_status") return refresh(snapshotId, userId);
    return cancel(snapshotId, userId);
  },
}));
