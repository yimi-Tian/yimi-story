import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function requiredBrowserEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY"): string {
  const value = import.meta.env[name]?.trim();
  if (!value) throw new Error(`缺少必要的瀏覽器環境設定：${name}`);
  return value;
}

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = requiredBrowserEnv("VITE_SUPABASE_URL");
  if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(url)) throw new Error("Supabase URL 格式無效");
  browserClient = createClient(url, requiredBrowserEnv("VITE_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return browserClient;
}
