import { describe, expect, it, vi } from "vitest";
import { checkAdminAccess } from "./admin-access";

function clientWith(result: { data: { is_active: boolean } | null; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })) } as never;
}

describe("checkAdminAccess", () => {
  it("active admin 通過", async () => expect(await checkAdminAccess(clientWith({ data: { is_active: true }, error: null }), "user-1")).toBe("active"));
  it("non-admin 被拒絕", async () => expect(await checkAdminAccess(clientWith({ data: null, error: null }), "user-2")).toBe("denied"));
  it("inactive admin 被拒絕", async () => expect(await checkAdminAccess(clientWith({ data: { is_active: false }, error: null }), "user-3")).toBe("inactive"));
  it("查詢失敗回安全的 network error", async () => expect(await checkAdminAccess(clientWith({ data: null, error: new Error("db") }), "user-4")).toBe("network_error"));
});
