import test from "node:test";
import { runPublicationMediaIntegration } from "./publication-media-integration-helpers.mjs";

const enabled=process.env.YIMI_RUN_CLOUD_PUBLICATION_MEDIA_INTEGRATION==="1";
test("Stage 7B Cloud temporary promotion完整清理",{skip:!enabled,timeout:300_000},async()=>{await runPublicationMediaIntegration({url:process.env.YIMI_CLOUD_SUPABASE_URL,publishableKey:process.env.YIMI_CLOUD_PUBLISHABLE_KEY,serviceKey:process.env.YIMI_CLOUD_SERVICE_ROLE_KEY,origin:"https://yimi-story-admin.pages.dev",expectedBaseline:{items:119,classes:56,activities:63,snapshots:119,drafts:0,media:714,legacy:714,cmsDraft:0,cmsPublic:0,preparations:0,mappings:0,publications:0,draftObjects:0,publicObjects:0},expectedLegacyDigest:"395f49c6767d46b6b4a485dc6655cc673c4603938a70c78a6ac342d2554d08af"});});
