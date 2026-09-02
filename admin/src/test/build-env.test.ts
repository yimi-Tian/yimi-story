import { expect, test } from "vitest";
import { validateAdminBuildEnv } from "../../build-env";

const valid = {
  VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "browser-safe-publishable-key",
};

test("production build 缺任一必要 browser env 時立即失敗", () => {
  expect(() => validateAdminBuildEnv({ ...valid, VITE_SUPABASE_URL: "" })).toThrow(/VITE_SUPABASE_URL/);
  expect(() => validateAdminBuildEnv({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: undefined })).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test("production build 拒絕 env example placeholder 與非 Supabase HTTPS URL", () => {
  expect(() => validateAdminBuildEnv({ ...valid, VITE_SUPABASE_URL: "https://your-project.supabase.co" })).toThrow(/範例值/);
  expect(() => validateAdminBuildEnv({ ...valid, VITE_SUPABASE_URL: "http://abcdefghijklmnopqrst.supabase.co" })).toThrow(/格式無效/);
  expect(() => validateAdminBuildEnv({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: "your-publishable-key" })).toThrow(/範例值/);
});

test("production build 接受有效 browser-safe Supabase env", () => {
  expect(() => validateAdminBuildEnv(valid)).not.toThrow();
});
