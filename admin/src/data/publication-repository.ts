import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublicationIssue { field: string; code: string; message: string }
export interface PublicationPreparation {
  valid: boolean;
  errors: PublicationIssue[];
  warnings: PublicationIssue[];
  validation: { revision: number; mediaCount: number; coverReady: boolean; exporterDeterministic: boolean };
  checksum: string;
}
export interface PublicationSnapshotSummary {
  id: string;
  revision: number;
  schemaVersion: string;
  checksum: string;
  status: string;
  createdAt: string;
}
export interface PublicationMediaPreparation {
  status: "preparing" | "ready" | "failed";
  requiredCount: number;
  promotedCount: number;
  legacyCount: number;
  failedCount: number;
  manifestChecksum: string | null;
  errorCode: string | null;
}
export interface GitHubPublication {
  id: string;
  snapshotId: string;
  status: "creating" | "dry_run_ready" | "branch_created" | "open" | "merged" | "deploy_pending" | "deployed" | "finalized" | "failed" | "cancelled";
  branch: string;
  baseSha: string;
  commitSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  changedFiles: string[];
  beforeCounts: { classResults: number; activities: number } | null;
  afterCounts: { classResults: number; activities: number } | null;
  checkedAt: string | null;
  finalizedAt?: string | null;
  errorCode: string | null;
}

export interface PublicationTimeline {
  publishedSnapshot: PublicationSnapshotSummary | null;
  entries: { publication: GitHubPublication; snapshot: PublicationSnapshotSummary }[];
}

// Read by content identity, not draft revision or the recent-ten-snapshots window.
export async function fetchPublicationTimeline(client: SupabaseClient, contentId: string): Promise<PublicationTimeline> {
  const pointer = await client.from("content_items").select("published_snapshot_id").eq("id", contentId).single();
  if (pointer.error) fail("PUBLICATION_HISTORY_FAILED");
  const publications: GitHubPublication[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from("github_publications")
      .select("id,snapshot_id,pr_state,head_branch,base_sha,commit_sha,pr_number,pr_url,formal_manifest,checked_at,finalized_at,error_code")
      .eq("content_id", contentId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 99);
    if (error) fail("PUBLICATION_HISTORY_FAILED");
    publications.push(...(data ?? []).map((row) => githubPublication(row as Record<string, unknown>)));
    if (!data || data.length < 100) break;
  }
  const ids = [...new Set([pointer.data?.published_snapshot_id, ...publications.map((row) => row.snapshotId)].filter(Boolean))] as string[];
  const snapshots: PublicationSnapshotSummary[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.from("publication_snapshots")
      .select("id,source_revision,schema_version,checksum_sha256,status,created_at")
      .eq("content_id", contentId).in("id", ids.slice(offset, offset + 100));
    if (error) fail("PUBLICATION_HISTORY_FAILED");
    snapshots.push(...(data ?? []).map((row) => ({ id: String(row.id), revision: Number(row.source_revision), schemaVersion: String(row.schema_version), checksum: String(row.checksum_sha256), status: String(row.status), createdAt: String(row.created_at) })));
  }
  if (ids.some((id) => !snapshots.some((snapshot) => snapshot.id === id))) fail("PUBLICATION_HISTORY_FAILED");
  return {
    publishedSnapshot: snapshots.find((snapshot) => snapshot.id === pointer.data?.published_snapshot_id) ?? null,
    entries: publications.map((publication) => ({ publication, snapshot: snapshots.find((snapshot) => snapshot.id === publication.snapshotId)! })),
  };
}

function fail(code: string): never { throw new Error(code); }

export async function requestPublicationPreparation(
  client: SupabaseClient,
  draftId: string,
  expectedRevision: number,
  action: "validate" | "create",
): Promise<{ preparation: PublicationPreparation; snapshot?: PublicationSnapshotSummary }> {
  const { data, error } = await client.functions.invoke("prepare-publication-snapshot", {
    body: { action, draftId, expectedRevision },
  });
  if (error || !data?.preparation) {
    const code = data?.error === "stale_revision" ? "PUBLICATION_STALE_REVISION"
      : data?.error === "draft_not_validated" ? "PUBLICATION_DRAFT_NOT_VALIDATED"
      : "PUBLICATION_REQUEST_FAILED";
    fail(code);
  }
  const snapshot = data.snapshot ? {
    id: String(data.snapshot.id),
    revision: Number(data.snapshot.source_revision),
    schemaVersion: String(data.snapshot.schema_version),
    checksum: String(data.snapshot.checksum_sha256),
    status: String(data.snapshot.status),
    createdAt: String(data.snapshot.created_at),
  } : undefined;
  return { preparation: data.preparation as PublicationPreparation, snapshot };
}

export async function fetchPublicationSnapshots(client: SupabaseClient, contentId: string): Promise<PublicationSnapshotSummary[]> {
  const { data, error } = await client.from("publication_snapshots")
    .select("id,source_revision,schema_version,checksum_sha256,status,created_at")
    .eq("content_id", contentId).eq("snapshot_source", "draft")
    .order("created_at", { ascending: false }).limit(10);
  if (error) fail("PUBLICATION_HISTORY_FAILED");
  return (data ?? []).map((row) => ({
    id: String(row.id), revision: Number(row.source_revision), schemaVersion: String(row.schema_version), checksum: String(row.checksum_sha256),
    status: String(row.status), createdAt: String(row.created_at),
  }));
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function preparationStatus(value: unknown): PublicationMediaPreparation["status"] {
  return value === "ready" || value === "failed" ? value : "preparing";
}

function mediaPreparation(row: Record<string, unknown>): PublicationMediaPreparation {
  return {
    status: preparationStatus(row.status),
    requiredCount: count(row.required_count),
    promotedCount: count(row.promoted_count),
    legacyCount: count(row.legacy_count),
    failedCount: count(row.failed_count),
    manifestChecksum: row.manifest_checksum_sha256 ? String(row.manifest_checksum_sha256) : null,
    errorCode: row.error_code ? String(row.error_code) : null,
  };
}

export async function fetchPublicationMediaPreparation(client: SupabaseClient, snapshotId: string): Promise<PublicationMediaPreparation | null> {
  const { data, error } = await client.from("publication_media_preparations")
    .select("status,required_count,promoted_count,legacy_count,failed_count,manifest_checksum_sha256,error_code")
    .eq("publication_snapshot_id", snapshotId).maybeSingle();
  if (error) fail("PUBLICATION_MEDIA_STATUS_FAILED");
  return data ? mediaPreparation(data as Record<string, unknown>) : null;
}

export async function requestPublicationMediaPreparation(client: SupabaseClient, snapshotId: string): Promise<PublicationMediaPreparation> {
  const { data, error } = await client.functions.invoke("prepare-publication-media", { body: { snapshotId } });
  if (error || !data?.preparation) {
    const code = typeof data?.error === "string" ? data.error : "PROMOTION_FAILED";
    fail(code);
  }
  const item = data.preparation as Record<string, unknown>;
  return {
    status: preparationStatus(item.status),
    requiredCount: count(item.requiredCount),
    promotedCount: count(item.promotedCount),
    legacyCount: count(item.legacyCount),
    failedCount: count(item.failedCount),
    manifestChecksum: item.manifestChecksum ? String(item.manifestChecksum) : null,
    errorCode: item.errorCode ? String(item.errorCode) : null,
  };
}

function githubPublication(value: Record<string, unknown>): GitHubPublication {
  const manifest = value.formal_manifest as Record<string, unknown> | undefined;
  const shape = value.beforeCounts !== undefined ? value : {
    id: value.id, snapshotId: value.snapshot_id, status: value.pr_state, branch: value.head_branch,
    baseSha: value.base_sha, commitSha: value.commit_sha, prNumber: value.pr_number, prUrl: value.pr_url,
    changedFiles: manifest?.changedFiles, beforeCounts: manifest?.beforeCounts, afterCounts: manifest?.afterCounts,
    checkedAt: value.checked_at, finalizedAt: value.finalized_at, errorCode: value.error_code,
  };
  return {
    id: String(shape.id), snapshotId: String(shape.snapshotId), status: String(shape.status) as GitHubPublication["status"],
    branch: String(shape.branch), baseSha: String(shape.baseSha), commitSha: shape.commitSha ? String(shape.commitSha) : null,
    prNumber: shape.prNumber ? Number(shape.prNumber) : null, prUrl: shape.prUrl ? String(shape.prUrl) : null,
    changedFiles: Array.isArray(shape.changedFiles) ? shape.changedFiles.map(String) : [],
    beforeCounts: shape.beforeCounts as GitHubPublication["beforeCounts"] ?? null,
    afterCounts: shape.afterCounts as GitHubPublication["afterCounts"] ?? null,
    checkedAt: shape.checkedAt ? String(shape.checkedAt) : null, errorCode: shape.errorCode ? String(shape.errorCode) : null,
    finalizedAt: shape.finalizedAt ? String(shape.finalizedAt) : null,
  };
}

export async function fetchGitHubPublication(client: SupabaseClient, snapshotId: string): Promise<GitHubPublication | null> {
  const { data, error } = await client.from("github_publications")
    .select("id,snapshot_id,pr_state,head_branch,base_sha,commit_sha,pr_number,pr_url,formal_manifest,checked_at,finalized_at,error_code")
    .eq("snapshot_id", snapshotId).maybeSingle();
  if (error) fail("GITHUB_PUBLICATION_STATUS_FAILED");
  return data ? githubPublication(data as Record<string, unknown>) : null;
}

export async function requestGitHubPublication(
  client: SupabaseClient,
  snapshotId: string,
  action: "dry_run" | "create_draft_pr" | "refresh_status" | "cancel",
): Promise<GitHubPublication> {
  const { data, error } = await client.functions.invoke("prepare-github-publication", { body: { action, snapshotId } });
  if (error || !data?.publication) fail(typeof data?.error === "string" ? data.error : "GITHUB_PUBLICATION_FAILED");
  return githubPublication(data.publication as Record<string, unknown>);
}

export async function finalizeGitHubPublication(client: SupabaseClient, snapshotId: string): Promise<GitHubPublication> {
  const { data, error } = await client.functions.invoke("finalize-github-publication", { body: { snapshotId } });
  if (error || !data?.publication) fail(typeof data?.error === "string" ? data.error : "FINALIZATION_FAILED");
  return githubPublication(data.publication as Record<string, unknown>);
}
