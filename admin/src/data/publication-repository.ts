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
  revision: number;
  checksum: string;
  status: string;
  createdAt: string;
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
    revision: Number(data.snapshot.source_revision),
    checksum: String(data.snapshot.checksum_sha256),
    status: String(data.snapshot.status),
    createdAt: String(data.snapshot.created_at),
  } : undefined;
  return { preparation: data.preparation as PublicationPreparation, snapshot };
}

export async function fetchPublicationSnapshots(client: SupabaseClient, contentId: string): Promise<PublicationSnapshotSummary[]> {
  const { data, error } = await client.from("publication_snapshots")
    .select("source_revision,checksum_sha256,status,created_at")
    .eq("content_id", contentId).eq("snapshot_source", "draft")
    .order("created_at", { ascending: false }).limit(10);
  if (error) fail("PUBLICATION_HISTORY_FAILED");
  return (data ?? []).map((row) => ({
    revision: Number(row.source_revision), checksum: String(row.checksum_sha256),
    status: String(row.status), createdAt: String(row.created_at),
  }));
}
