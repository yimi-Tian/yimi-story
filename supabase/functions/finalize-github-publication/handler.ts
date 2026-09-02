import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";

type Admin = { status: "active" | "inactive" | "not_admin" | "invalid"; userId?: string };
type Dependencies = {
  verify(token: string): Promise<Admin>;
  finalize(snapshotId: string, userId: string): Promise<Record<string, unknown>>;
};
function bearer(request: Request): string | null { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/iu)?.[1] ?? null; }
function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value); }

export function createFinalizeGitHubPublicationHandler(allowedOrigin: string, deps: Dependencies) {
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
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return jsonResponse({ error: "invalid_request" }, 400, headers); }
    if (!validUuid(body.snapshotId) || Object.keys(body).some((key) => key !== "snapshotId")) return jsonResponse({ error: "invalid_request" }, 400, headers);
    try { return jsonResponse({ publication: await deps.finalize(body.snapshotId, admin.userId) }, 200, headers); }
    catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/u.test(error.message) ? error.message : "FINALIZATION_FAILED";
      return jsonResponse({ error: code }, code.endsWith("_NOT_FOUND") ? 404 : code.includes("PENDING") ? 409 : 422, headers);
    }
  };
}
