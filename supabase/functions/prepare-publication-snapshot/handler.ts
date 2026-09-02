import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";

type Admin = { status: "active" | "inactive" | "not_admin" | "invalid"; userId?: string };
type Input = { action: "validate" | "create"; draftId: string; expectedRevision: number };
type Preparation = {
  valid: boolean;
  errors: Array<{ field: string; code: string; message: string }>;
  warnings: Array<{ field: string; code: string; message: string }>;
  validation: Record<string, unknown>;
  checksum: string;
  mediaManifest: unknown[];
  publicData: Record<string, unknown>;
};
type Snapshot = { id: string; schema_version: string; created_at: string; source_revision: number; checksum_sha256: string; status: string };
type Dependencies = {
  verify(token: string): Promise<Admin>;
  prepare(input: Input, userId: string): Promise<Preparation>;
  create(input: Input, userId: string, preparation: Preparation): Promise<Snapshot>;
};

function safePreparation(preparation: Preparation) {
  return {
    valid: preparation.valid,
    errors: preparation.errors,
    warnings: preparation.warnings,
    validation: preparation.validation,
    checksum: preparation.checksum,
  };
}

function bearer(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createPreparePublicationSnapshotHandler(allowedOrigin: string, deps: Dependencies) {
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
    if (!input || !["validate", "create"].includes(input.action) || !validUuid(input.draftId) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      return jsonResponse({ error: "invalid_request" }, 400, headers);
    }
    try {
      const preparation = await deps.prepare(input, admin.userId);
      if (input.action === "validate") return jsonResponse({ preparation: safePreparation(preparation) }, 200, headers);
      if (!preparation.valid) return jsonResponse({ error: "publication_validation_failed", preparation: safePreparation(preparation) }, 422, headers);
      const snapshot = await deps.create(input, admin.userId, preparation);
      return jsonResponse({ preparation: safePreparation(preparation), snapshot }, 200, headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "publication_preparation_failed";
      const code = /revision changed|stale_revision/.test(message) ? "stale_revision"
        : /validated draft|required/.test(message) ? "draft_not_validated"
        : "publication_preparation_failed";
      return jsonResponse({ error: code }, code === "stale_revision" ? 409 : 400, headers);
    }
  };
}
