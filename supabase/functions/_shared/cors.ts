export const DEFAULT_LOCAL_ADMIN_ORIGIN = "http://localhost:5173";

export function isAllowedOrigin(
  request: Request,
  allowedOrigin: string,
): boolean {
  const requestOrigin = request.headers.get("origin");
  return requestOrigin === null || requestOrigin === allowedOrigin;
}

export function corsHeaders(
  request: Request,
  allowedOrigin: string,
  allowedMethods: readonly string[],
): HeadersInit {
  const requestOrigin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };

  if (requestOrigin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  return headers;
}
