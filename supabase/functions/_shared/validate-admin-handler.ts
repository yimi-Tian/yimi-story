import { corsHeaders, isAllowedOrigin } from "./cors.ts";
import { emptyResponse, jsonResponse } from "./http.ts";

export type AdminVerification =
  | "active"
  | "inactive"
  | "not_admin"
  | "invalid";

export type VerifyAdmin = (token: string) => Promise<AdminVerification>;

type SafeLogger = Pick<Console, "error">;

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export function createValidateAdminHandler(
  verifyAdmin: VerifyAdmin,
  allowedOrigin: string,
  logger: SafeLogger = console,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const headers = corsHeaders(request, allowedOrigin, ["POST", "OPTIONS"]);

    if (!isAllowedOrigin(request, allowedOrigin)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403, headers);
    }

    if (request.method === "OPTIONS") {
      return emptyResponse(204, headers);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, headers);
    }

    const token = bearerToken(request);
    if (!token) {
      return jsonResponse(
        { authenticated: false, admin: false },
        401,
        headers,
      );
    }

    try {
      const verification = await verifyAdmin(token);

      if (verification === "invalid") {
        return jsonResponse(
          { authenticated: false, admin: false },
          401,
          headers,
        );
      }

      if (verification !== "active") {
        return jsonResponse(
          { authenticated: true, admin: false },
          403,
          headers,
        );
      }

      return jsonResponse(
        { authenticated: true, admin: true },
        200,
        headers,
      );
    } catch (_error) {
      logger.error("validate-admin verification failed");
      return jsonResponse({ error: "internal_error" }, 500, headers);
    }
  };
}
