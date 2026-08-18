export function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function emptyResponse(
  status = 204,
  headers: HeadersInit = {},
): Response {
  return new Response(null, { status, headers });
}
