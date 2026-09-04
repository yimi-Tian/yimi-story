import { expect, test, vi } from "vitest";
import { fetchPublicationMediaPreparation, fetchPublicationSnapshots, fetchPublicationTimeline, requestPublicationMediaPreparation, requestPublicationPreparation } from "./publication-repository";

test("timeline依content/published pointer讀取，舊snapshot不受最近10筆限制且不寫入",async()=>{
  const raw=(id:string,revision:number)=>({id,source_revision:revision,schema_version:"1.1",checksum_sha256:"a".repeat(64),status:"ready",created_at:"2026-09-03T00:00:00Z"});
  const calls:unknown[][]=[];
  const from=vi.fn((table:string)=>{
    const result={select:vi.fn((...args:unknown[])=>{calls.push([table,"select",...args]);return result;}),eq:vi.fn((...args:unknown[])=>{calls.push([table,"eq",...args]);return result;}),order:vi.fn(()=>result),
      single:vi.fn().mockResolvedValue({data:{published_snapshot_id:"published"},error:null}),
      range:vi.fn().mockResolvedValue({data:[{id:"active",snapshot_id:"older-active",pr_state:"open"},{id:"finished",snapshot_id:"published",pr_state:"finalized"}],error:null}),
      in:vi.fn().mockResolvedValue({data:[raw("published",14),raw("older-active",15)],error:null})};return result;
  });
  const value=await fetchPublicationTimeline({from} as never,"only-this-content");
  expect(value.publishedSnapshot?.revision).toBe(14);expect(value.entries[0].snapshot.revision).toBe(15);
  expect(calls).toContainEqual(["github_publications","eq","content_id","only-this-content"]);
  expect(calls).toContainEqual(["publication_snapshots","eq","content_id","only-this-content"]);
  expect(calls.some((call)=>call.includes("source_revision"))).toBe(false);
});

test("timeline讀取錯誤拒絕而非假裝無active publication",async()=>{
  const client={from:()=>({select:()=>({eq:()=>({single:async()=>({data:null,error:{code:"42501"}})})})})} as never;
  await expect(fetchPublicationTimeline(client,"safe")).rejects.toThrow("PUBLICATION_HISTORY_FAILED");
});

test("publication Edge request只送action、draft與expected revision",async()=>{const invoke=vi.fn().mockResolvedValue({data:{preparation:{valid:true,errors:[],warnings:[],validation:{revision:2,mediaCount:0,coverReady:true,exporterDeterministic:true},checksum:"a".repeat(64)},snapshot:{id:"snapshot-safe",schema_version:"1.1",source_revision:2,checksum_sha256:"a".repeat(64),status:"ready",created_at:"2026-08-28T00:00:00Z"}},error:null});const client={functions:{invoke}} as never;const result=await requestPublicationPreparation(client,"draft-safe",2,"create");expect(invoke).toHaveBeenCalledWith("prepare-publication-snapshot",{body:{action:"create",draftId:"draft-safe",expectedRevision:2}});expect(result.snapshot).toMatchObject({id:"snapshot-safe",schemaVersion:"1.1",revision:2});});
test("history僅讀draft snapshots並限制筆數",async()=>{const limit=vi.fn().mockResolvedValue({data:[{id:"snapshot",source_revision:3,schema_version:"1.1",checksum_sha256:"b".repeat(64),status:"ready",created_at:"2026-08-28T00:00:00Z"}],error:null});const order=vi.fn(()=>({limit})),eq2=vi.fn(()=>({order})),eq1=vi.fn(()=>({eq:eq2})),select=vi.fn(()=>({eq:eq1})),client={from:vi.fn(()=>({select}))} as never;const rows=await fetchPublicationSnapshots(client,"content-safe");expect(eq2).toHaveBeenCalledWith("snapshot_source","draft");expect(limit).toHaveBeenCalledWith(10);expect(rows[0]).toMatchObject({id:"snapshot",revision:3,schemaVersion:"1.1"});});
test("讀取persisted正式圖片準備狀態",async()=>{const maybeSingle=vi.fn().mockResolvedValue({data:{status:"ready",required_count:3,promoted_count:3,legacy_count:0,failed_count:0,manifest_checksum_sha256:"c".repeat(64),error_code:null},error:null});const eq=vi.fn(()=>({maybeSingle})),select=vi.fn(()=>({eq})),client={from:vi.fn(()=>({select}))} as never;const result=await fetchPublicationMediaPreparation(client,"snapshot");expect(eq).toHaveBeenCalledWith("publication_snapshot_id","snapshot");expect(result).toMatchObject({status:"ready",requiredCount:3,promotedCount:3});});
test("preparation row不存在時回傳null",async()=>{const maybeSingle=vi.fn().mockResolvedValue({data:null,error:null});const client={from:vi.fn(()=>({select:vi.fn(()=>({eq:vi.fn(()=>({maybeSingle}))}))}))} as never;await expect(fetchPublicationMediaPreparation(client,"snapshot")).resolves.toBeNull();});
test("preparation缺漏counts時安全正規化為0",async()=>{const maybeSingle=vi.fn().mockResolvedValue({data:{status:"preparing"},error:null});const client={from:vi.fn(()=>({select:vi.fn(()=>({eq:vi.fn(()=>({maybeSingle}))}))}))} as never;await expect(fetchPublicationMediaPreparation(client,"snapshot")).resolves.toMatchObject({status:"preparing",requiredCount:0,promotedCount:0,legacyCount:0,failedCount:0});});
test("正式圖片準備request只送snapshot ID",async()=>{const invoke=vi.fn().mockResolvedValue({data:{preparation:{status:"ready",requiredCount:1,promotedCount:1,legacyCount:0,failedCount:0,manifestChecksum:"d".repeat(64),errorCode:null}},error:null});const client={functions:{invoke}} as never;const result=await requestPublicationMediaPreparation(client,"snapshot-safe");expect(invoke).toHaveBeenCalledWith("prepare-publication-media",{body:{snapshotId:"snapshot-safe"}});expect(result.status).toBe("ready");});
