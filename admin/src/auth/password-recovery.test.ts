import { describe, expect, it, vi } from "vitest";
import { recoveryRedirectUrl, requestPasswordRecovery, updateRecoveredPassword } from "./password-recovery";

describe("password recovery", () => {
  it("建立固定的 production recovery path", () => {
    expect(recoveryRedirectUrl("https://admin.example.com/"))
      .toBe("https://admin.example.com/update-password");
  });

  it("以 Supabase 官方 resetPasswordForEmail 並傳送精確 redirect URL", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { resetPasswordForEmail } };

    await requestPasswordRecovery(client as never, " admin@example.com ", "https://admin.example.com");

    expect(resetPasswordForEmail).toHaveBeenCalledWith("admin@example.com", {
      redirectTo: "https://admin.example.com/update-password",
    });
  });

  it("只透過 Auth updateUser 更新密碼", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { updateUser } };
    const password = "a-valid-private-password";

    await updateRecoveredPassword(client as never, password);

    expect(updateUser).toHaveBeenCalledWith({ password });
  });

  it("不向呼叫端暴露 Supabase 詳細錯誤", async () => {
    const resetClient = { auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ error: new Error("provider detail") }) } };
    const updateClient = { auth: { updateUser: vi.fn().mockResolvedValue({ error: new Error("provider detail") }) } };

    await expect(requestPasswordRecovery(resetClient as never, "admin@example.com", "https://admin.example.com"))
      .rejects.toThrow("RECOVERY_REQUEST_FAILED");
    await expect(updateRecoveredPassword(updateClient as never, "a-valid-private-password"))
      .rejects.toThrow("PASSWORD_UPDATE_FAILED");
  });
});
