import assert from "node:assert/strict";
import test from "node:test";
import { createAdminHealthHandler } from "../../supabase/functions/admin-health/handler.ts";
import {
  bearerToken,
  createValidateAdminHandler,
} from "../../supabase/functions/_shared/validate-admin-handler.ts";

const origin = "https://yimi-story-admin.pages.dev";
const request = (authorization, requestOrigin = origin) =>
  new Request("http://localhost/functions/v1/validate-admin", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(requestOrigin ? { origin: requestOrigin } : {}),
    },
  });

test("admin-health 回傳 ok、version、timestamp 且無 secrets", async () => {
  const handler = createAdminHealthHandler(
    "admin-v1-foundation/1.0",
    origin,
    () => new Date("2026-08-18T00:00:00.000Z"),
  );
  const response = await handler(new Request("http://localhost/health", {
    method: "GET",
    headers: { origin },
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    ok: true,
    version: "admin-v1-foundation/1.0",
    timestamp: "2026-08-18T00:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(body), /key|token|secret|project_ref/i);
});

test("CORS 不使用 wildcard 且拒絕未知 origin", async () => {
  const handler = createAdminHealthHandler("v1", origin);
  const response = await handler(new Request("http://localhost/health", {
    method: "GET",
    headers: { origin: "https://attacker.example" },
  }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("admin-health production preflight 只允許精確 origin 與必要 methods", async () => {
  const handler = createAdminHealthHandler("v1", origin);
  const response = await handler(new Request("https://function.example/admin-health", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "GET",
      "access-control-request-headers": "apikey, x-client-info",
    },
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
});

test("validate-admin production preflight 允許 POST 且 unknown origin 無 CORS 授權", async () => {
  const handler = createValidateAdminHandler(async () => "active", origin);
  const allowed = await handler(new Request("https://function.example/validate-admin", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, apikey, content-type, x-client-info",
    },
  }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), origin);
  assert.equal(allowed.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(
    allowed.headers.get("access-control-allow-headers"),
    "authorization, x-client-info, apikey, content-type",
  );

  const denied = await handler(new Request("https://function.example/validate-admin", {
    method: "OPTIONS",
    headers: { origin: "https://example.invalid" },
  }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  assert.notEqual(denied.headers.get("access-control-allow-origin"), "*");
});

test("bearer parser 僅接受 Bearer token", () => {
  assert.equal(bearerToken(request("Bearer user-jwt")), "user-jwt");
  assert.equal(bearerToken(request("Basic abc")), null);
  assert.equal(bearerToken(request(null)), null);
});

test("未登入 validate-admin 回傳 401", async () => {
  const handler = createValidateAdminHandler(async () => "active", origin);
  const response = await handler(request(null));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false, admin: false });
});

test("無效 JWT validate-admin 回傳 401", async () => {
  const handler = createValidateAdminHandler(async () => "invalid", origin);
  const response = await handler(request("Bearer invalid"));
  assert.equal(response.status, 401);
});

test("非 admin 與 inactive admin 回傳 403", async () => {
  for (const result of ["not_admin", "inactive"]) {
    const handler = createValidateAdminHandler(async () => result, origin);
    const response = await handler(request("Bearer valid-user"));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { authenticated: true, admin: false });
  }
});

test("active admin 回傳 200", async () => {
  const handler = createValidateAdminHandler(async () => "active", origin);
  const response = await handler(request("Bearer valid-admin"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true, admin: true });
});

test("驗證器例外只回傳安全錯誤，不洩漏 stack 或 secret", async () => {
  const logs = [];
  const handler = createValidateAdminHandler(
    async () => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY=do-not-leak");
    },
    origin,
    { error: (message) => logs.push(message) },
  );
  const response = await handler(request("Bearer valid-user"));
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.equal(text, '{"error":"internal_error"}');
  assert.doesNotMatch(text, /SUPABASE|service|stack|do-not-leak/i);
  assert.deepEqual(logs, ["validate-admin verification failed"]);
});
