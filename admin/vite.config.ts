import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { validateAdminBuildEnv } from "./build-env.js";

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const loaded = loadEnv(mode, process.cwd(), "VITE_");
    validateAdminBuildEnv({
      ...loaded,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? loaded.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? loaded.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
  }
  return {
    plugins: [react()],
    build: { sourcemap: false },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      clearMocks: true,
    },
  };
});
