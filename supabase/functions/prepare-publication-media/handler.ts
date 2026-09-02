import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";

type Admin = { status: "active" | "inactive" | "not_admin" | "invalid"; userId?: string };
type Input = { snapshotId: string };
export type MediaPreparationSummary = {
  status: "preparing" | "ready" | "failed";
  requiredCount: number;
  promotedCount: number;
  legacyCount: number;
  failedCount: number;
  manifestChecksum: string | null;
  errorCode: string | null;
};
type Dependencies = {
  verify(token: string): Promise<Admin>;
  prepare(input: Input, userId: string): Promise<MediaPreparationSummary>;
};

function bearer(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function statusFor(code: string): number {
  if (code === "SNAPSHOT_NOT_FOUND") return 404;
  if (code === "DESTINATION_CONFLICT") return 409;
  if (["SNAPSHOT_NOT_READY", "SOURCE_MEDIA_MISSING", "SOURCE_OBJECT_MISSING", "SOURCE_CHECKSUM_MISMATCH", "PUBLIC_MEDIA_VERIFY_FAILED"].includes(code)) return 422;
  return 400;
}

export function createPreparePublicationMediaHandler(allowedOrigin: string, deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const headers = corsHeaders(request, allowedOrigin, ["POST", "OPTIONS"]);
    if (!isAllowedOrigin(request, allowedOrigin)) return jsonResponse({ error: "origin_not_allowed" }, 403, headers);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, headers);
    const token = bearer(request);
    if (!token) return jsonResponse({ error: "authentication_required" }, 401, headers);
    const admin = await deps.verify(token);
    if (admin.status === "invalid") return jsonResponse({ error: "invalid_token" }, 401, headers);
    if (admin.status !== "active" || !admin.userId) return jsonResponse({ error: "admin_required" }, 403, headers);
    let input: Input;
    try { input = await request.json(); } catch { return jsonResponse({ error: "invalid_request" }, 400, headers); }
    if (!input || !validUuid(input.snapshotId)) return jsonResponse({ error: "invalid_request" }, 400, headers);
    try {
      const preparation = await deps.prepare(input, admin.userId);
      return jsonResponse({ preparation }, 200, headers);
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
        ? error.message : "PROMOTION_FAILED";
      return jsonResponse({ error: code }, statusFor(code), headers);
    }
  };
}
