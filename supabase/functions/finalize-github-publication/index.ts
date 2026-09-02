import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import { DEFAULT_LOCAL_ADMIN_ORIGIN } from "../_shared/cors.ts";
import { sha256Hex, type FormalFilePath } from "../_shared/formal-publication.ts";
import { GitHubPublicationClient, githubCredentialsFromEnv } from "../_shared/github-publication.ts";
import { createFinalizeGitHubPublicationHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN") ?? DEFAULT_LOCAL_ADMIN_ORIGIN;
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const github = new GitHubPublicationClient(githubCredentialsFromEnv());
class FinalizationError extends Error {}
const fail = (code: string): never => { throw new FinalizationError(code); };
const one = (value: unknown): Record<string, unknown> => Array.isArray(value) ? value[0] : value as Record<string, unknown>;

async function verify(token: string) {
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return { status: "invalid" as const };
  const admin = await service.from("admin_users").select("is_active").eq("user_id", data.user.id).maybeSingle();
  if (admin.error) throw new Error("admin_lookup_failed");
  return admin.data ? { status: admin.data.is_active ? "active" as const : "inactive" as const, userId: data.user.id }
    : { status: "not_admin" as const };
}

function summary(row: Record<string, unknown>) {
  return {
    id: String(row.id), snapshotId: String(row.snapshot_id), status: String(row.pr_state),
    prNumber: Number(row.pr_number), prUrl: String(row.pr_url), mergeCommitSha: String(row.merge_commit_sha),
    finalizedAt: row.finalized_at ? String(row.finalized_at) : null,
  };
}

async function finalize(snapshotId: string, userId: string) {
  const result = await service.from("github_publications").select("*").eq("snapshot_id", snapshotId).maybeSingle();
  if (result.error) fail("PUBLICATION_READ_FAILED");
  const publication = result.data as Record<string, unknown> | null;
  if (!publication) fail("PUBLICATION_NOT_FOUND");
  if (publication.pr_state === "finalized") return summary(publication);
  if (!publication.pr_number || !publication.commit_sha) fail("PULL_REQUEST_NOT_READY");
  const pr = await github.getPullRequest(Number(publication.pr_number));
  if (!pr.merged || !pr.mergeCommitSha) fail("PULL_REQUEST_NOT_MERGED");
  if (pr.headSha !== publication.commit_sha) fail("PULL_REQUEST_IDENTITY_MISMATCH");
  const manifest = publication.formal_manifest as Record<string, unknown>;
  const files = manifest?.files as Array<{ path: FormalFilePath; sha256: string; changed: boolean }>;
  if (!Array.isArray(files) || files.length !== 6) fail("FORMAL_MANIFEST_INVALID");
  for (const file of files) {
    const current = await github.readFile(file.path, "main");
    if (await sha256Hex(current.text) !== file.sha256) fail("MAIN_FORMAL_FILES_PENDING");
  }
  const pages = await github.getPagesDeploymentStatus(files.filter((file) => file.changed));
  if (pages !== "deployed") fail(pages === "pending" ? "PAGES_DEPLOYMENT_PENDING" : "PAGES_DEPLOYMENT_FAILED");
  const deployed = await service.rpc("set_github_publication_state", {
    p_actor_id: userId, p_publication_id: publication.id, p_state: "deployed", p_merge_commit_sha: pr.mergeCommitSha,
  });
  if (deployed.error) fail("PUBLICATION_STATE_WRITE_FAILED");
  const finalized = await service.rpc("finalize_github_publication", {
    p_actor_id: userId, p_publication_id: publication.id, p_merge_commit_sha: pr.mergeCommitSha,
  });
  if (finalized.error || !finalized.data) {
    if (finalized.error?.code === "40001") fail("PUBLISHED_POINTER_CHANGED");
    fail("FINALIZATION_FAILED");
  }
  return summary(one(finalized.data));
}

Deno.serve(createFinalizeGitHubPublicationHandler(allowedOrigin, { verify, finalize }));
