import test from "node:test";
import { runPublicationMediaIntegration } from "./publication-media-integration-helpers.mjs";

const enabled=process.env.YIMI_RUN_PUBLICATION_MEDIA_INTEGRATION==="1";
test("Stage 7B local snapshot media promotion、retry、failure compensation與安全邊界",{skip:!enabled,timeout:240_000},async()=>{await runPublicationMediaIntegration({url:process.env.YIMI_LOCAL_SUPABASE_URL,publishableKey:process.env.YIMI_LOCAL_ANON_KEY,serviceKey:process.env.YIMI_LOCAL_SERVICE_ROLE_KEY,origin:"http://localhost:5173",expectedBaseline:{items:119,classes:56,activities:63,snapshots:119,drafts:0,media:714,legacy:714,cmsDraft:0,cmsPublic:0,preparations:0,mappings:0,publications:0,draftObjects:0,publicObjects:0}});});
