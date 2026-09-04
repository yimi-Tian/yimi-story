import { describe, expect, it } from "vitest";
import { contentStatusLabel, downgradeValidatedAfterEdit, filterContentItems } from "./content-list";
import type { ContentListItem } from "./content-repository";

function item(publicId: string, type: "class_result" | "activity", data: Record<string, unknown>, draft = false): ContentListItem {
  return { contentId: publicId, contentType: type, publicId, publishedSnapshotId: "snapshot", publishedAt: "2026-01-01", draftId: draft ? "draft" : null, draftStatus: draft ? "draft" : null, revision: draft ? 1 : null, updatedAt: "2026-01-01", mediaCount: 0, publishedData: (draft ? { ...data, publicNotes: "prior public text" } : data) as never, data: data as never };
}

describe("內容列表搜尋與篩選", () => {
  it.each(["CR-115-001", "115-002"])("%s readonly: identical auto-created r1 remains published; only canonical edits change badge", (publicId) => {
    const data = publicId.startsWith("CR") ? { title: "既有班級", galleryAssetIds: ["a", "b"] } : { name: "木藝傳情‧修繕送暖", participants: 40 };
    const row = item(publicId, publicId.startsWith("CR") ? "class_result" : "activity", data, true);
    row.publishedRevision = 0;
    row.publishedData = { ...data, revision: 0, internalNotes: "previous" } as never;
    row.data = { ...data, revision: 1, updated_at: "new", technicalMetadata: { uuid: "different" }, internalNotes: "private edit" } as never;
    const before = JSON.stringify(row);
    expect(contentStatusLabel(row)).toBe("已發布");
    expect(filterContentItems([row], { keyword: "", year: "", district: "", status: "published" })).toHaveLength(1);
    expect(filterContentItems([row], { keyword: "", year: "", district: "", status: "published_with_draft" })).toHaveLength(0);
    expect(JSON.stringify(row)).toBe(before);
    row.data = { ...data, publicNotes: "公開內容修改" } as never;
    expect(contentStatusLabel(row)).toBe("已發布・有未發布修改");
  });
  const classes = Array.from({ length: 56 }, (_, index) => item(`CR-115-${String(index + 1).padStart(3, "0")}`, "class_result", { year: 115, title: index === 2 ? "稻米課程" : `班級 ${index + 1}`, className: "地方學", instructor: index === 3 ? "王老師" : "陳老師", districts: [index % 2 ? "朴子市" : "太保市"] }, index === 4));
  const activities = Array.from({ length: 63 }, (_, index) => item(`112-${String(index + 1).padStart(3, "0")}`, "activity", { year: index < 20 ? 112 : 113, name: index === 1 ? "海洋走讀" : `活動 ${index + 1}`, leader: index === 2 ? "林老師" : "帶領者", projectName: "地方計畫", topic: "文化", districts: ["朴子市"], activityType: index % 2 ? "走讀" : "講座" }, index === 5));

  it("56 筆班級支援 title、instructor、district 與 draft badge", () => {
    expect(filterContentItems(classes, { keyword: "", year: "", district: "", status: "all" })).toHaveLength(56);
    expect(filterContentItems(classes, { keyword: "稻米", year: "", district: "", status: "all" })).toHaveLength(1);
    expect(filterContentItems(classes, { keyword: "王老師", year: "", district: "", status: "all" })).toHaveLength(1);
    expect(filterContentItems(classes, { keyword: "", year: "", district: "朴子市", status: "all" })).toHaveLength(28);
    expect(contentStatusLabel(classes[4])).toBe("已發布・有未發布修改");
  });

  it("63 筆活動支援 name、leader、year、activityType 與 draft badge", () => {
    expect(filterContentItems(activities, { keyword: "", year: "", district: "", status: "all" })).toHaveLength(63);
    expect(filterContentItems(activities, { keyword: "海洋", year: "", district: "", status: "all" })).toHaveLength(1);
    expect(filterContentItems(activities, { keyword: "林老師", year: "", district: "", status: "all" })).toHaveLength(1);
    expect(filterContentItems(activities, { keyword: "", year: "112", district: "", status: "all" })).toHaveLength(20);
    expect(filterContentItems(activities, { keyword: "", year: "", district: "", status: "all", activityType: "走讀" })).toHaveLength(31);
    expect(contentStatusLabel(activities[5])).toBe("已發布・有未發布修改");
  });

  it("validated 內容修改後自動降回 draft", () => expect(downgradeValidatedAfterEdit("validated")).toBe("draft"));
});
