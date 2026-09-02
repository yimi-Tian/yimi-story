const REQUIRED_PUBLIC_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const;

export function validateAdminBuildEnv(env: Record<string, string | undefined>) {
  for (const name of REQUIRED_PUBLIC_ENV) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Admin production build 缺少 ${name}`);
    if (/your-project|your-publishable-key/i.test(value)) throw new Error(`Admin production build 的 ${name} 仍是範例值`);
  }
  if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(env.VITE_SUPABASE_URL!.trim())) {
    throw new Error("Admin production build 的 VITE_SUPABASE_URL 格式無效");
  }
}
