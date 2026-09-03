import {
  addIssue,
  createValidationResult,
  detectDuplicateParagraphs,
  isStrictIsoDate,
} from "./normalize-common.mjs";

function validateString(result, field, value, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    addIssue(result, "errors", field, "string.length", `${field} 長度必須為 ${minimum}–${maximum} 字。`);
  }
}

function validateHttpsUrl(result, field, value) {
  if (value === null) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    addIssue(result, "errors", field, "url.httpsOnly", `${field} 只允許完整 HTTPS URL 或 null。`);
  }
}

export function validateActivity(data, options = {}) {
  const result = createValidationResult();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    addIssue(result, "errors", "$", "type.object", "活動資料必須為物件。");
    return result;
  }

  if (!/^\d{3}-\d{3}$/.test(data.id || "")) addIssue(result, "errors", "id", "id.format", "ID 必須符合民國年-三位序號。");
  if (!Number.isInteger(data.year) || data.year < 100 || data.year > 199) addIssue(result, "errors", "year", "year.range", "year 必須為 100–199 的整數。");
  const idYear = Number(String(data.id || "").match(/^(\d{3})-/)?.[1]);
  if (Number.isFinite(idYear) && idYear !== data.year) addIssue(result, "errors", "year", "year.idMismatch", "ID 年度與 year 不一致。");
  validateString(result, "name", data.name, 2, 150);
  validateString(result, "dateLabel", data.dateLabel, 1, 40);
  validateString(result, "venue", data.venue, 1, 150);
  validateString(result, "activityType", data.activityType, 1, 50);
  validateString(result, "topic", data.topic, 1, 100);
  validateString(result, "summary", data.summary, 20, 3000);

  if (data.startDate !== null && !isStrictIsoDate(data.startDate)) addIssue(result, "errors", "startDate", "date.iso", "startDate 必須是有效 YYYY-MM-DD 或 null。");
  if (data.endDate !== null && !isStrictIsoDate(data.endDate)) addIssue(result, "errors", "endDate", "date.iso", "endDate 必須是有效 YYYY-MM-DD 或 null。");
  if (data.endDate !== null && data.startDate === null) addIssue(result, "errors", "endDate", "date.startRequired", "有 endDate 時必須提供 startDate。");
  if (data.startDate && data.endDate && data.endDate < data.startDate) addIssue(result, "errors", "endDate", "date.order", "endDate 不得早於 startDate。");
  if (!options.legacyImport && data.startDate === null) addIssue(result, "errors", "startDate", "date.required", "新資料的 startDate 必填。");
  if (options.legacyImport && data.startDate === null) addIssue(result, "warnings", "startDate", "legacyImport.dateUnparsed", `保留既有日期文字，未猜測 ISO 日期：${data.dateLabel}`);

  if (!Array.isArray(data.districts) || data.districts.length < 1 || data.districts.length > 5 || new Set(data.districts).size !== data.districts.length) addIssue(result, "errors", "districts", "districts.count", "districts 必須有 1–5 個不重複項目。");
  for (const district of data.districts || []) {
    if (typeof district !== "string" || !district || district.length > 30) addIssue(result, "errors", "districts", "districts.value", "地區長度必須為 1–30 字。");
    if (options.settings && !options.settings.allowedDistricts.includes(district)) addIssue(result, options.legacyImport ? "warnings" : "errors", "districts", options.legacyImport ? "legacyImport.district" : "districts.notAllowed", `地區不在邑米服務範圍設定：${district}`);
  }

  if (data.projectName !== null && (typeof data.projectName !== "string" || data.projectName.length > 150)) addIssue(result, "errors", "projectName", "string.length", "projectName 最多 150 字或 null。");
  if (!Array.isArray(data.sdgs) || data.sdgs.length < 1 || data.sdgs.length > 17 || new Set(data.sdgs).size !== data.sdgs.length || data.sdgs.some((sdg) => !/^SDG (?:[1-9]|1[0-7])$/.test(sdg))) addIssue(result, "errors", "sdgs", "sdgs.format", "SDGs 必須是 1–17 的不重複 SDG N 值。");
  if (data.participants !== null && (!Number.isInteger(data.participants) || data.participants < 0 || data.participants > 1000000)) addIssue(result, "errors", "participants", "participants.range", "請輸入 0 到 1,000,000 的整數。");
  if (data.partnerOrganizations !== null && (typeof data.partnerOrganizations !== "string" || data.partnerOrganizations.length > 500)) addIssue(result, "errors", "partnerOrganizations", "string.length", "partnerOrganizations 最多 500 字或 null。");
  if (data.leader !== null && (typeof data.leader !== "string" || data.leader.length > 200)) addIssue(result, "errors", "leader", "string.length", "leader 最多 200 字或 null。");
  if (!Array.isArray(data.keywords) || data.keywords.length > 20 || new Set(data.keywords).size !== data.keywords.length || data.keywords.some((keyword) => typeof keyword !== "string" || !keyword || keyword.length > 30)) addIssue(result, "errors", "keywords", "keywords.invalid", "keywords 最多 20 個不重複的 1–30 字項目。");
  validateHttpsUrl(result, "videoUrl", data.videoUrl);
  validateHttpsUrl(result, "relatedUrl", data.relatedUrl);
  if (typeof data.featured !== "boolean") addIssue(result, "errors", "featured", "boolean.required", "featured 必須為 boolean。");
  if (data.internalNotes !== null && (typeof data.internalNotes !== "string" || data.internalNotes.length > 1000)) addIssue(result, "errors", "internalNotes", "notes.length", "internalNotes 最多 1000 字或 null。");
  if (data.publicNotes !== null && (typeof data.publicNotes !== "string" || data.publicNotes.length > 1000)) addIssue(result, "errors", "publicNotes", "notes.length", "publicNotes 最多 1000 字或 null。");
  if (data.coverAssetId !== null && (typeof data.coverAssetId !== "string" || !data.coverAssetId || data.coverAssetId.length > 200)) addIssue(result, "errors", "coverAssetId", "asset.invalid", "coverAssetId 必須為非空字串或 null。");
  if (!Array.isArray(data.galleryAssetIds) || data.galleryAssetIds.length > 30 || new Set(data.galleryAssetIds).size !== data.galleryAssetIds.length) addIssue(result, "errors", "galleryAssetIds", "asset.gallery", "galleryAssetIds 最多 30 個且不得重複。");
  if (data.coverAssetId && (data.galleryAssetIds || []).includes(data.coverAssetId)) addIssue(result, "errors", "galleryAssetIds", "asset.coverRepeated", "相簿不得包含封面 asset ID。");

  const duplicates = detectDuplicateParagraphs(data.summary);
  if (duplicates.length) addIssue(result, "warnings", "summary", "text.duplicateParagraph", `偵測到 ${duplicates.length} 個完整重複段落。`);
  result.valid = result.errors.length === 0;
  return result;
}

export function validateActivityCollection(records, options = {}) {
  const result = createValidationResult();
  const ids = new Set();
  for (const [index, data] of records.entries()) {
    const itemResult = validateActivity(data, options);
    for (const issue of itemResult.errors) result.errors.push({ ...issue, field: `[${index}].${issue.field}` });
    for (const issue of itemResult.warnings) result.warnings.push({ ...issue, field: `[${index}].${issue.field}` });
    if (ids.has(data.id)) addIssue(result, "errors", `[${index}].id`, "id.duplicate", `活動 ID 重複：${data.id}`);
    ids.add(data.id);
  }
  result.valid = result.errors.length === 0;
  return result;
}
