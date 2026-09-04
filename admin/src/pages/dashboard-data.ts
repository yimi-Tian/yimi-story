import type { SupabaseClient } from "@supabase/supabase-js";
import { unpublishedContentState, type CanonicalContent } from "../content/content-contracts";

export interface DashboardCounts {
  classResults: number;
  activities: number;
  published: number;
  media: number;
  drafts: number;
  needsValidation: number;
}

async function exactCount(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error("DASHBOARD_QUERY_FAILED");
  return count ?? 0;
}

export async function fetchDashboardCounts(client: SupabaseClient): Promise<DashboardCounts> {
  const [classResults, activities, published, media, pending] = await Promise.all([
    exactCount(client.from("content_items").select("id", { count: "exact", head: true }).eq("content_type", "class_result")),
    exactCount(client.from("content_items").select("id", { count: "exact", head: true }).eq("content_type", "activity")),
    exactCount(client.from("publication_snapshots").select("id", { count: "exact", head: true })),
    exactCount(client.from("media_assets").select("id", { count: "exact", head: true })),
    fetchPendingCounts(client),
  ]);
  return { classResults, activities, published, media, ...pending };
}

// Read-only: compare saved drafts to the pointer's snapshot; never create a draft.
async function fetchPendingCounts(client: SupabaseClient) {
  let drafts = 0, needsValidation = 0;
  const first = (value: unknown) => (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("content_items").select(
      "id,published_snapshot_id,drafts:content_drafts!inner(id,status,data),published:publication_snapshots!content_items_published_snapshot_id_fkey(snapshot_data)",
    ).order("id").range(offset, offset + 499);
    if (error) throw new Error("DASHBOARD_QUERY_FAILED");
    for (const row of data ?? []) {
      const draft = first(row.drafts), published = first(row.published);
      if (!draft) continue;
      const state = unpublishedContentState({ publishedSnapshotId: row.published_snapshot_id, draftId: String(draft.id), data: draft.data as CanonicalContent, publishedData: published?.snapshot_data as CanonicalContent | undefined });
      if (state === "unknown") throw new Error("DASHBOARD_COMPARISON_UNAVAILABLE");
      if (state === "changed" || state === "unpublished") {
        drafts++;
        if (draft.status === "draft") needsValidation++;
      }
    }
    if ((data?.length ?? 0) < 500) break;
  }
  return { drafts, needsValidation };
}
