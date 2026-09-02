import test from "node:test";
import assert from "node:assert/strict";
import { createPreparePublicationMediaHandler } from "../../supabase/functions/prepare-publication-media/handler.ts";

const origin="https://yimi-story-admin.pages.dev",snapshotId="11111111-1111-4111-8111-111111111111";
const request=(body={snapshotId},requestOrigin=origin,token="safe-test")=>new Request("https://example/functions/v1/prepare-publication-media",{method:"POST",headers:{origin:requestOrigin,authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});
const ready={status:"ready",requiredCount:3,promotedCount:3,legacyCount:0,failedCount:0,manifestChecksum:"a".repeat(64),errorCode:null};
const deps=(status="active")=>({verify:async()=>({status,userId:status==="active"?"admin":undefined}),prepare:async()=>ready});

test("active admin只送snapshot ID並取得安全摘要",async()=>{let received;const handler=createPreparePublicationMediaHandler(origin,{...deps(),prepare:async(input,userId)=>{received={input,userId};return ready;}});const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(received,{input:{snapshotId},userId:"admin"});assert.deepEqual(await response.json(),{preparation:ready});});
test("unknown origin、invalid與inactive admin皆拒絕",async()=>{assert.equal((await createPreparePublicationMediaHandler(origin,deps())(request({},"https://evil.invalid"))).status,403);assert.equal((await createPreparePublicationMediaHandler(origin,deps("invalid"))(request())).status,401);assert.equal((await createPreparePublicationMediaHandler(origin,deps("inactive"))(request())).status,403);});
test("錯誤碼映射穩定且不回傳stack",async()=>{for(const [code,status] of [["SNAPSHOT_NOT_READY",422],["SOURCE_OBJECT_MISSING",422],["DESTINATION_CONFLICT",409],["PROMOTION_FAILED",400]]){const response=await createPreparePublicationMediaHandler(origin,{...deps(),prepare:async()=>{throw new Error(code);}})(request());assert.equal(response.status,status);const body=await response.json();assert.deepEqual(body,{error:code});assert.equal(JSON.stringify(body).includes("stack"),false);}});
test("CORS精確origin且preflight無wildcard",async()=>{const response=await createPreparePublicationMediaHandler(origin,deps())(new Request("https://example",{method:"OPTIONS",headers:{origin}}));assert.equal(response.status,204);assert.equal(response.headers.get("access-control-allow-origin"),origin);assert.notEqual(response.headers.get("access-control-allow-origin"),"*");});
