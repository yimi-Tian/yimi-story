import test from "node:test";
import assert from "node:assert/strict";
import { runPreviewIntegration } from "./preview-integration-helpers.mjs";

const enabled = process.env.YIMI_RUN_PREVIEW_INTEGRATION === "1";
test("Stage 6 local draft-first/published fallback/mixed signed media preview is read-only", { skip: !enabled, timeout: 120_000 }, async () => {
  const url=process.env.YIMI_LOCAL_SUPABASE_URL,publishableKey=process.env.YIMI_LOCAL_ANON_KEY,serviceKey=process.env.YIMI_LOCAL_SERVICE_ROLE_KEY;
  assert.ok(url&&publishableKey&&serviceKey,"local preview env required");
  await runPreviewIntegration({ url,publishableKey,serviceKey,origin:"http://localhost:5173",expectedBaseline:{items:119,snapshots:119,drafts:0,media:714,legacy:714,publications:0} });
});
