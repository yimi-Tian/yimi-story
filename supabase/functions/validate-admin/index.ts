import { DEFAULT_LOCAL_ADMIN_ORIGIN } from "../_shared/cors.ts";
import { verifyActiveAdmin } from "../_shared/supabase-admin.ts";
import { createValidateAdminHandler } from "../_shared/validate-admin-handler.ts";

const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN") ??
  DEFAULT_LOCAL_ADMIN_ORIGIN;
const handler = createValidateAdminHandler(verifyActiveAdmin, allowedOrigin);

Deno.serve(handler);
