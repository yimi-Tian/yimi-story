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
