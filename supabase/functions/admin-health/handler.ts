import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { emptyResponse, jsonResponse } from "../_shared/http.ts";

export function createAdminHealthHandler(
  serviceVersion: string,
  allowedOrigin: string,
  now: () => Date = () => new Date(),
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const headers = corsHeaders(request, allowedOrigin, ["GET", "OPTIONS"]);

    if (!isAllowedOrigin(request, allowedOrigin)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403, headers);
    }

    if (request.method === "OPTIONS") {
      return emptyResponse(204, headers);
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, headers);
    }

    return jsonResponse(
      {
        ok: true,
        version: serviceVersion,
        timestamp: now().toISOString(),
      },
      200,
      headers,
    );
  };
}
