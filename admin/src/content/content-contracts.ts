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

const validationFieldLabels: Record<string, string> = {
  participants: "參與人次",
};

export function presentValidationIssue(issue: ValidationIssue): ValidationIssue {
  const field = validationFieldLabels[issue.field] ?? issue.field;
  const message = issue.field === "participants"
    ? issue.message.replaceAll("participants", "參與人次").replaceAll("參與人數", "參與人次").replaceAll("參加人數", "參與人次")
    : issue.message;
  return { ...issue, field, message };
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
