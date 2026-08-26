import test from "node:test";
import assert from "node:assert/strict";
import { runPreviewIntegration } from "./preview-integration-helpers.mjs";

const enabled = process.env.YIMI_RUN_CLOUD_PREVIEW_INTEGRATION === "1";
test("Stage 6 production temporary preview is fully cleaned", { skip: !enabled, timeout: 120_000 }, async () => {
  const url=process.env.YIMI_CLOUD_SUPABASE_URL,publishableKey=process.env.YIMI_CLOUD_PUBLISHABLE_KEY,serviceKey=process.env.YIMI_CLOUD_SERVICE_ROLE_KEY;
  assert.ok(url&&publishableKey&&serviceKey,"cloud preview env required");
  await runPreviewIntegration({ url,publishableKey,serviceKey,origin:"https://yimi-story-admin.pages.dev",expectedBaseline:{items:119,snapshots:119,drafts:0,media:714,legacy:714,publications:0},expectedLegacyDigest:"395f49c6767d46b6b4a485dc6655cc673c4603938a70c78a6ac342d2554d08af" });
});
