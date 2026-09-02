import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";

export type GitHubPublicationAction = "dry_run" | "create_draft_pr" | "refresh_status" | "cancel";
type Admin = { status: "active" | "inactive" | "not_admin" | "invalid"; userId?: string };
type Dependencies = {
  verify(token: string): Promise<Admin>;
  execute(action: GitHubPublicationAction, snapshotId: string, userId: string): Promise<Record<string, unknown>>;
};

function bearer(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/iu)?.[1] ?? null;
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
function statusFor(code: string): number {
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (["MAIN_CHANGED", "BRANCH_CONFLICT", "ACTIVE_PUBLICATION_EXISTS", "PUBLICATION_IDENTITY_CONFLICT"].includes(code)) return 409;
  if (["SNAPSHOT_NOT_ELIGIBLE", "MEDIA_NOT_READY", "FORMAL_EXPORT_INVALID", "PUBLICATION_NOT_CANCELLABLE"].includes(code)) return 422;
  return 400;
}

export function createPrepareGitHubPublicationHandler(allowedOrigin: string, deps: Dependencies) {
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
    const action = body.action;
    if (!["dry_run", "create_draft_pr", "refresh_status", "cancel"].includes(String(action)) || !validUuid(body.snapshotId)) {
      return jsonResponse({ error: "invalid_request" }, 400, headers);
    }
    if (Object.keys(body).some((key) => !["action", "snapshotId"].includes(key))) {
      return jsonResponse({ error: "server_managed_fields_only" }, 400, headers);
    }
    try {
      return jsonResponse({ publication: await deps.execute(action as GitHubPublicationAction, body.snapshotId, admin.userId) }, 200, headers);
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/u.test(error.message) ? error.message : "GITHUB_PUBLICATION_FAILED";
      return jsonResponse({ error: code }, statusFor(code), headers);
    }
  };
}
