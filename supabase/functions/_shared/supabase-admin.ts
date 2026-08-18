import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import type { AdminVerification } from "./validate-admin-handler.ts";

export async function verifyActiveAdmin(
  token: string,
): Promise<AdminVerification> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Required server configuration is missing");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return "invalid";
  }

  const { data: admin, error: adminError } = await client
    .from("admin_users")
    .select("is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError) {
    throw new Error("Admin allow-list lookup failed");
  }

  if (!admin) {
    return "not_admin";
  }

  return admin.is_active ? "active" : "inactive";
}
