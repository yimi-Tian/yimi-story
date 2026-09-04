import { describe, expect, it } from "vitest";
import {
  activityDataToForm,
  classDataToForm,
  districtOptions,
  normalizeContentForm,
  presentValidationIssue,
  matchesPublishedContent,
  validateCanonicalContent,
  type ActivityForm,
  type ClassResultForm,
} from "./content-contracts";

const classForm: ClassResultForm = {
  id: "CR-115-003", year: "115", title: "測試班級成果", className: "地方課程", instructor: "測試講師",
  description: "這是一段足夠長度的班級成果描述，用來驗證正式 canonical 規則。", districts: ["嘉義縣"], venue: "測試場地",
  tags: [" 地方 ", "地方", "成果"], sdgs: ["sdg1", "SDG 1", "2"], displayOrder: "3",
  publicNotes: "公開說明", internalNotes: "CR-115-003 既有內部備註", coverAssetId: "legacy-cover", galleryAssetIds: [],
};

it("altText驗證在UI統一名稱與訊息但保留field及code",()=>{
  const source={field:"media.altText",code:"media_alt_required",message:"新上傳圖片必須填寫替代文字。"};
  const output=presentValidationIssue(source);
  expect(output).toMatchObject({field:"圖片替代文字（網站不顯示）",message:"請填寫圖片替代文字",canonicalField:"media.altText",code:"media_alt_required",targetId:"media-section"});
  expect(source.message).toBe("新上傳圖片必須填寫替代文字。");
  expect(presentValidationIssue({field:"coverAssetId",code:"media.altMissing",message:"請填寫圖片說明文字。"}).message).toBe("請填寫圖片替代文字");
});

it("網站版本比較忽略物件key順序與內部備註，但保留公開欄位及相簿順序差異",()=>{
  const data=normalizeContentForm("class_result",classForm);
  expect(matchesPublishedContent(data,{...data,internalNotes:"只改內部"})).toBe(true);
  expect(matchesPublishedContent(data,{...data,title:"新的成果"})).toBe(false);
  expect(matchesPublishedContent({...data,galleryAssetIds:["a","b"]},{...data,galleryAssetIds:["b","a"]})).toBe(false);
});

const activityForm: ActivityForm = {
  id: "112-015", year: "112", name: "既有活動", startDate: "", endDate: "", dateLabel: "112年5月",
  districts: ["臺北市"], venue: "既有場地", projectName: "既有計畫", activityType: "走讀", topic: "地方文化",
  sdgs: ["SDG 11"], summary: "這是一段足夠長度的活動成果摘要，用來保留既有日期與缺少封面的文字編輯。",
  participants: "20", partnerOrganizations: "合作單位", leader: "帶領者", keywords: ["走讀", "走讀"], videoUrl: "", relatedUrl: "",
  featured: false, publicNotes: "", internalNotes: "既有備註", coverAssetId: null, galleryAssetIds: [],
};

describe("Stage 1 canonical adapter", () => {
  it("CR-115-003 保留 internalNotes 並正規化 tag 與 SDG", () => {
    const data = normalizeContentForm("class_result", classForm);
    expect(data.internalNotes).toBe("CR-115-003 既有內部備註");
    expect(data.publicNotes).toBe("公開說明");
    expect(data.tags).toEqual(["地方", "成果"]);
    expect(data.sdgs).toEqual(["SDG 1", "SDG 2"]);
    expect(classDataToForm(data).internalNotes).toBe(classForm.internalNotes);
  });

  it("112-015 缺封面與 legacy 日期不阻擋文字編輯，也不猜 ISO", () => {
    const data = normalizeContentForm("activity", activityForm);
    const result = validateCanonicalContent("activity", data, true);
    expect(data.startDate).toBeNull();
    expect(data.endDate).toBeNull();
    expect(data.dateLabel).toBe("112年5月");
    expect(data.coverAssetId).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((issue) => issue.code === "legacyImport.dateUnparsed")).toBe(true);
    expect(activityDataToForm(data).districts).toEqual(["臺北市"]);
    expect(data).toHaveProperty("participants", 20);
    expect(data).not.toHaveProperty("參與人次");
  });

  it("participants validation issue 只在顯示層轉為參與人次", () => {
    expect(presentValidationIssue({ field: "participants", code: "participants.range", message: "participants 必須為整數。" }))
      .toMatchObject({ field: "參與人次", canonicalField: "participants", targetId: "field-participants", code: "participants.range", message: "請輸入整數。" });
  });

  it("驗證欄位會映射至中文標籤與可聚焦目標", () => {
    expect(presentValidationIssue({ field: "dateLabel", code: "required", message: "dateLabel 為必填。" })).toMatchObject({ field: "活動日期", targetId: "field-dateLabel" });
    expect(presentValidationIssue({ field: "coverAssetId", code: "required", message: "coverAssetId 為必填。" })).toMatchObject({ field: "封面圖片", targetId: "media-cover" });
    expect(presentValidationIssue({ field: "galleryAssetIds.0", code: "required", message: "galleryAssetIds.0 為必填。" })).toMatchObject({ field: "相簿第 1 張", targetId: "media-gallery-1" });
  });

  it("legacy district 可保留在表單，正常選項仍以 service area 為主", () => {
    expect(districtOptions).not.toContain("臺北市");
    expect(activityForm.districts).toContain("臺北市");
  });
});
