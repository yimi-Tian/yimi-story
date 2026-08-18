import { DEFAULT_LOCAL_ADMIN_ORIGIN } from "../_shared/cors.ts";
import { createAdminHealthHandler } from "./handler.ts";

const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN") ??
  DEFAULT_LOCAL_ADMIN_ORIGIN;
const handler = createAdminHealthHandler(
  "admin-v1-foundation/1.0",
  allowedOrigin,
);

Deno.serve(handler);
