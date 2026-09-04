import { expect, test } from "vitest";
import { resolvePublicationUiState } from "./publication-ui-state";
import type { GitHubPublication, PublicationSnapshotSummary, PublicationTimeline } from "../data/publication-repository";

const snapshot=(revision:number):PublicationSnapshotSummary=>({id:`snapshot-${revision}`,revision,schemaVersion:"1.1",checksum:"a".repeat(64),status:"ready",createdAt:`2026-09-${String(revision).padStart(2,"0")}T00:00:00Z`});
const publication=(revision:number,status:GitHubPublication["status"]):GitHubPublication=>({id:`publication-${revision}-${status}`,snapshotId:`snapshot-${revision}`,status,branch:"safe",baseSha:"b".repeat(40),commitSha:null,prNumber:null,prUrl:null,changedFiles:[],beforeCounts:null,afterCounts:null,checkedAt:null,errorCode:null});
const timeline=(published:number|null,entries:[number,GitHubPublication["status"]][]):PublicationTimeline=>({publishedSnapshot:published?snapshot(published):null,entries:entries.map(([revision,status])=>({snapshot:snapshot(revision),publication:publication(revision,status)}))});
const resolve=(history:PublicationTimeline,revision:number,current:number|null,ready=true)=>resolvePublicationUiState({timeline:history,revision,contentState:"changed",currentSnapshot:current?snapshot(current):null,mediaPreparation:current&&ready?{status:"ready",requiredCount:1,promotedCount:1,legacyCount:0,failedCount:0,manifestChecksum:"c".repeat(64),errorCode:null}:null});

test("finalized優先於圖片ready且不再顯示尚未公開",()=>{const state=resolve(timeline(14,[[14,"finalized"]]),14,14);expect(state.primaryLabel).toBe("發布完成");expect(state.secondaryMessage).not.toContain("尚未公開");expect(state.showAdminWaiting).toBe(false);});

test("115-002 finalized plus identical newer draft stays completed without unpublished badge", () => {
  const state = resolvePublicationUiState({ timeline: timeline(14, [[14,"finalized"]]), revision: 15, currentSnapshot: null, mediaPreparation: null, contentState: "synced" });
  expect(state.primaryLabel).toBe("發布完成");
  expect(state.showUnpublishedChanges).toBe(false);
});

test.each(["synced", "changed"] as const)("baseline r0 plus auto-created r1 uses canonical state %s", (contentState) => {
  const state = resolvePublicationUiState({ timeline: { publishedSnapshot: snapshot(0), entries: [] }, revision: 1, currentSnapshot: null, mediaPreparation: null, contentState });
  expect(state.showUnpublishedChanges).toBe(contentState === "changed");
  expect(state.primaryLabel).toBe(contentState === "synced" ? "內容已同步" : "有未發布變更");
});
test.each(["failed","cancelled"] as const)("%s不會誤判為等待管理員確認",(status)=>{const state=resolve(timeline(14,[[15,status],[14,"finalized"]]),15,15);expect(state.showAdminWaiting).toBe(false);expect(state.primaryLabel).not.toBe("等待管理員確認");});
test("published r14與draft r15同時保留正式版本與未發布變更",()=>{const state=resolve(timeline(14,[[14,"finalized"]]),15,null,false);expect(state.showPublishedVersion).toBe(true);expect(state.showUnpublishedChanges).toBe(true);expect(state.canPrepare).toBe(true);});
test("r15已準備但尚無publication，不被r14 finalized掩蓋",()=>{const state=resolve(timeline(14,[[14,"finalized"]]),15,15);expect(state.primaryLabel).toBe("可送出發布");expect(state.canSend).toBe(true);expect(state.showPublishedVersion).toBe(true);expect(state.finalized).toBe(false);});
test("active publication r15與newer draft r16並存時阻擋新準備",()=>{const state=resolve(timeline(14,[[15,"open"],[14,"finalized"]]),16,null,false);expect(state.showAdminWaiting).toBe(true);expect(state.active?.snapshot.revision).toBe(15);expect(state.canPrepare).toBe(false);});
test.each(["cancelled","failed"] as const)("published r14、%s r15、draft r16仍顯示正式版本並可準備",(status)=>{const state=resolve(timeline(14,[[15,status],[14,"finalized"]]),16,null,false);expect(state.showPublishedVersion).toBe(true);expect(state.showUnpublishedChanges).toBe(true);expect(state.showAdminWaiting).toBe(false);expect(state.canPrepare).toBe(true);});
