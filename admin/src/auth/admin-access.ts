import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAccess = "active" | "inactive" | "denied" | "network_error";

export async function checkAdminAccess(client: SupabaseClient, userId: string): Promise<AdminAccess> {
  const { data, error } = await client.from("admin_users").select("is_active").eq("user_id", userId).maybeSingle();
  if (error) return "network_error";
  if (!data) return "denied";
  return data.is_active === true ? "active" : "inactive";
}
