import type { SupabaseClient } from "@supabase/supabase-js";

export const PASSWORD_RECOVERY_PATH = "/update-password";

export function recoveryRedirectUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}${PASSWORD_RECOVERY_PATH}`;
}

export async function requestPasswordRecovery(
  client: SupabaseClient,
  email: string,
  origin: string,
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: recoveryRedirectUrl(origin),
  });
  if (error) throw new Error("RECOVERY_REQUEST_FAILED");
}

export async function updateRecoveredPassword(
  client: SupabaseClient,
  password: string,
): Promise<void> {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error("PASSWORD_UPDATE_FAILED");
}
