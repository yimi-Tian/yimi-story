import type { SupabaseClient } from "@supabase/supabase-js";

export interface DashboardCounts {
  classResults: number;
  activities: number;
  published: number;
  media: number;
}

async function exactCount(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error("DASHBOARD_QUERY_FAILED");
  return count ?? 0;
}

export async function fetchDashboardCounts(client: SupabaseClient): Promise<DashboardCounts> {
  const [classResults, activities, published, media] = await Promise.all([
    exactCount(client.from("content_items").select("id", { count: "exact", head: true }).eq("content_type", "class_result")),
    exactCount(client.from("content_items").select("id", { count: "exact", head: true }).eq("content_type", "activity")),
    exactCount(client.from("publication_snapshots").select("id", { count: "exact", head: true })),
    exactCount(client.from("media_assets").select("id", { count: "exact", head: true })),
  ]);
  return { classResults, activities, published, media };
}
