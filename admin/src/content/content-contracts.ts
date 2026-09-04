import type { ActivityData } from "../../../src/content-types/activity";
import type { ClassResultData } from "../../../src/content-types/class-result";
import settings from "../../../config/content-settings.json";
// @ts-expect-error Stage 1 browser-safe ESM is JavaScript and intentionally reused directly.
import { normalizeActivity } from "../../../tools/content/normalize-activity.mjs";
// @ts-expect-error Stage 1 browser-safe ESM is JavaScript and intentionally reused directly.
import { normalizeClassResult } from "../../../tools/content/normalize-class-result.mjs";
// @ts-expect-error Stage 1 browser-safe ESM is JavaScript and intentionally reused directly.
import { validateActivity } from "../../../tools/content/validate-activity.mjs";
// @ts-expect-error Stage 1 browser-safe ESM is JavaScript and intentionally reused directly.
import { validateClassResult } from "../../../tools/content/validate-class-result.mjs";

export type ContentType = "class_result" | "activity";
export type DraftStatus = "draft" | "validated";

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export const imageAltTextLabel = "圖片替代文字（網站不顯示）";
export const imageAltTextHelp = "供無障礙閱讀與圖片載入失敗時使用，請簡短描述照片內容。";
export const imageAltTextRequired = "請填寫圖片替代文字";

export const validationFieldLabels: Record<string, string> = {
  id: "內容編號", name: "活動名稱", title: "成果名稱", className: "課程名稱",
  year: "年度", startDate: "開始日期", endDate: "結束日期", dateLabel: "活動日期",
  districts: "鄉鎮", venue: "活動地點", projectName: "計畫名稱", activityType: "活動類型",
  topic: "活動主題", sdgs: "SDGs", summary: "活動說明", description: "成果說明",
  participants: "參與人次", partnerOrganizations: "合作單位", leader: "講師／帶領人",
  instructor: "講師", keywords: "關鍵字", tags: "標籤", videoUrl: "影片連結",
  relatedUrl: "延伸連結", featured: "首頁精選", displayOrder: "顯示順序",
  publicNotes: "公開備註", internalNotes: "內部備註", coverAssetId: "封面圖片",
  galleryAssetIds: "相簿圖片", media: "圖片", altText: imageAltTextLabel,
};

export interface PresentedValidationIssue extends ValidationIssue { canonicalField: string; targetId: string }

export function validationFieldLabel(field: string): string {
  if (field === "media.altText" || field === "altText") return imageAltTextLabel;
  const root = field.split(/[.[]/, 1)[0];
  if (field.startsWith("galleryAssetIds.")) {
    const index = Number(field.split(".")[1]);
    return Number.isInteger(index) ? `相簿第 ${index + 1} 張` : "相簿圖片";
  }
  return validationFieldLabels[root] ?? "內容資料";
}

export function validationTargetId(field: string): string {
  if (field === "coverAssetId") return "media-cover";
  if (field.startsWith("galleryAssetIds.")) return `media-gallery-${Number(field.split(".")[1]) + 1}`;
  if (field === "galleryAssetIds" || field === "media" || field === "media.altText" || field === "altText") return "media-section";
  return `field-${field.split(/[.[]/, 1)[0]}`;
}

function translateMessage(issue: ValidationIssue): string {
  if (issue.code === "media.altMissing" || issue.code === "media_alt_required") return imageAltTextRequired;
  const label = validationFieldLabel(issue.field);
  let message = issue.message
    .replaceAll(issue.field, label)
    .replaceAll("participants", "參與人次")
    .replaceAll("參與人數", "參與人次")
    .replaceAll("參加人數", "參與人次");
  message = message.replaceAll("圖片說明文字", "圖片替代文字").replaceAll("尚未補齊替代文字", "尚未補齊圖片替代文字");
  message = message
    .replace(/長度必須為\s*1\s*[-–~～]\s*(\d+)\s*字[。.]?/u, "請填寫 1～$1 個字。")
    .replace(/必須為\s*0\s*[-–~～到]\s*1,?000,?000\s*的?整數[。.]?/u, "請輸入 0～1,000,000 的整數。")
    .replace(/必須為整數[。.]?/u, "請輸入整數。");
  message = message.replace(new RegExp(`^${label}[：:\\s]*`, "u"), "");
  return message || "請確認此欄位內容。";
}

export function translateValidationIssue(issue: ValidationIssue): PresentedValidationIssue {
  return { ...issue, canonicalField: issue.field, field: validationFieldLabel(issue.field), targetId: validationTargetId(issue.field), message: translateMessage(issue) };
}

export const presentValidationIssue = translateValidationIssue;

// UI-only public canonical allowlist. Never compare row/revision/time metadata.
// This does not change normalization, snapshot validation or publication contracts.
const publicCanonicalKeys = [
  "id", "year", "title", "className", "instructor", "description", "districts", "venue", "tags", "sdgs", "displayOrder",
  "name", "startDate", "endDate", "dateLabel", "projectName", "activityType", "topic", "summary", "participants",
  "partnerOrganizations", "leader", "keywords", "videoUrl", "relatedUrl", "featured", "publicNotes", "coverAssetId", "galleryAssetIds",
] as const;
export function matchesPublishedContent(draft: CanonicalContent, published: CanonicalContent): boolean {
  const pick = (data: CanonicalContent) => publicCanonicalKeys.map((key) => (data as unknown as Record<string, unknown>)[key]);
  return JSON.stringify(pick(draft)) === JSON.stringify(pick(published));
}

export function unpublishedContentState(item: {
  publishedSnapshotId: string | null; draftId: string | null;
  data: CanonicalContent; publishedData?: CanonicalContent | null;
}): "unpublished" | "synced" | "changed" | "unknown" {
  if (!item.publishedSnapshotId) return "unpublished";
  if (!item.draftId) return "synced";
  if (!item.publishedData) return "unknown";
  return matchesPublishedContent(item.data, item.publishedData) ? "synced" : "changed";
}

export interface ClassResultForm {
  id: string;
  year: string;
  title: string;
  className: string;
  instructor: string;
  description: string;
  districts: string[];
  venue: string;
  tags: string[];
  sdgs: string[];
  displayOrder: string;
  publicNotes: string;
  internalNotes: string;
  coverAssetId: string | null;
  galleryAssetIds: string[];
}

export interface ActivityForm {
  id: string;
  year: string;
  name: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  districts: string[];
  venue: string;
  projectName: string;
  activityType: string;
  topic: string;
  sdgs: string[];
  summary: string;
  participants: string;
  partnerOrganizations: string;
  leader: string;
  keywords: string[];
  videoUrl: string;
  relatedUrl: string;
  featured: boolean;
  publicNotes: string;
  internalNotes: string;
  coverAssetId: string | null;
  galleryAssetIds: string[];
}

export type ContentForm = ClassResultForm | ActivityForm;
export type CanonicalContent = ClassResultData | ActivityData;

export const districtOptions = settings.allowedDistricts;
export const sdgOptions = Array.from({ length: 17 }, (_, index) => `SDG ${index + 1}`);

export function emptyClassResultForm(year = 115): ClassResultForm {
  return {
    id: "",
    year: String(year),
    title: "",
    className: "",
    instructor: "",
    description: "",
    districts: [],
    venue: "",
    tags: [],
    sdgs: [],
    displayOrder: "1",
    publicNotes: "",
    internalNotes: "",
    coverAssetId: null,
    galleryAssetIds: [],
  };
}

export function emptyActivityForm(year = 115): ActivityForm {
  return {
    id: "",
    year: String(year),
    name: "",
    startDate: "",
    endDate: "",
    dateLabel: "",
    districts: [],
    venue: "",
    projectName: "",
    activityType: "",
    topic: "",
    sdgs: [],
    summary: "",
    participants: "",
    partnerOrganizations: "",
    leader: "",
    keywords: [],
    videoUrl: "",
    relatedUrl: "",
    featured: false,
    publicNotes: "",
    internalNotes: "",
    coverAssetId: null,
    galleryAssetIds: [],
  };
}

export function classDataToForm(data: ClassResultData): ClassResultForm {
  return {
    ...data,
    year: String(data.year),
    displayOrder: String(data.displayOrder),
    publicNotes: data.publicNotes ?? "",
    internalNotes: data.internalNotes ?? "",
  };
}

export function activityDataToForm(data: ActivityData): ActivityForm {
  return {
    ...data,
    year: String(data.year),
    startDate: data.startDate ?? "",
    endDate: data.endDate ?? "",
    participants: data.participants === null ? "" : String(data.participants),
    projectName: data.projectName ?? "",
    partnerOrganizations: data.partnerOrganizations ?? "",
    leader: data.leader ?? "",
    videoUrl: data.videoUrl ?? "",
    relatedUrl: data.relatedUrl ?? "",
    publicNotes: data.publicNotes ?? "",
    internalNotes: data.internalNotes ?? "",
  };
}

export function normalizeContentForm(type: "class_result", form: ClassResultForm): ClassResultData;
export function normalizeContentForm(type: "activity", form: ActivityForm): ActivityData;
export function normalizeContentForm(type: ContentType, form: ContentForm): CanonicalContent {
  if (type === "class_result") return normalizeClassResult(form).data as ClassResultData;
  return normalizeActivity(form).data as ActivityData;
}

export function validateCanonicalContent(type: ContentType, data: CanonicalContent, legacy = false): ValidationResult {
  const options = { settings, legacyImport: legacy };
  return (type === "class_result"
    ? validateClassResult(data, options)
    : validateActivity(data, options)) as ValidationResult;
}

export function formFromCanonical(type: "class_result", data: CanonicalContent): ClassResultForm;
export function formFromCanonical(type: "activity", data: CanonicalContent): ActivityForm;
export function formFromCanonical(type: ContentType, data: CanonicalContent): ContentForm {
  return type === "class_result"
    ? classDataToForm(data as ClassResultData)
    : activityDataToForm(data as ActivityData);
}
