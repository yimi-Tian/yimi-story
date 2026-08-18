import {
  addIssue,
  createValidationResult,
  detectDuplicateParagraphs,
  mergeValidationResults,
} from "./normalize-common.mjs";

function validateString(result, field, value, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    addIssue(result, "errors", field, "string.length", `${field} 長度必須為 ${minimum}–${maximum} 字。`);
  }
}

export function validateClassResult(data, options = {}) {
  const result = createValidationResult();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    addIssue(result, "errors", "$", "type.object", "班級成果資料必須為物件。");
    return result;
  }

  if (!/^CR-\d{3}-\d{3}$/.test(data.id || "")) addIssue(result, "errors", "id", "id.format", "ID 必須符合 CR-民國年-三位序號。");
  if (!Number.isInteger(data.year) || data.year < 100 || data.year > 199) addIssue(result, "errors", "year", "year.range", "year 必須為 100–199 的整數。");
  const idYear = Number(String(data.id || "").match(/^CR-(\d{3})-/)?.[1]);
  if (Number.isFinite(idYear) && idYear !== data.year) addIssue(result, "errors", "year", "year.idMismatch", "ID 年度與 year 不一致。");
  validateString(result, "title", data.title, 2, 100);
  validateString(result, "className", data.className, 1, 100);
  validateString(result, "instructor", data.instructor, 1, 80);
  validateString(result, "description", data.description, 20, 3000);
  validateString(result, "venue", data.venue, 1, 150);

  if (!Array.isArray(data.districts) || data.districts.length !== 1 || new Set(data.districts).size !== data.districts.length) {
    addIssue(result, "errors", "districts", "districts.count", "班級成果必須有一個不重複的地區。");
  }
  for (const district of data.districts || []) {
    if (typeof district !== "string" || !district || district.length > 30) addIssue(result, "errors", "districts", "districts.value", "地區長度必須為 1–30 字。");
    if (options.settings && !options.settings.allowedDistricts.includes(district)) {
      addIssue(result, options.legacyImport ? "warnings" : "errors", "districts", options.legacyImport ? "legacyImport.district" : "districts.notAllowed", `地區不在邑米服務範圍設定：${district}`);
    }
  }

  if (!Array.isArray(data.tags) || data.tags.length < 1 || data.tags.length > 10 || new Set(data.tags).size !== data.tags.length) {
    addIssue(result, "errors", "tags", "tags.count", "tags 必須有 1–10 個不重複項目。");
  }
  if ((data.tags || []).some((tag) => typeof tag !== "string" || !tag || tag.length > 30)) addIssue(result, "errors", "tags", "tags.value", "每個 tag 必須為 1–30 字。");
  if (!Array.isArray(data.sdgs) || data.sdgs.length < 1 || data.sdgs.length > 17 || new Set(data.sdgs).size !== data.sdgs.length || data.sdgs.some((sdg) => !/^SDG (?:[1-9]|1[0-7])$/.test(sdg))) {
    addIssue(result, "errors", "sdgs", "sdgs.format", "SDGs 必須是 1–17 的不重複 SDG N 值。");
  }
  if (!Number.isInteger(data.displayOrder) || data.displayOrder < 1) addIssue(result, "errors", "displayOrder", "displayOrder.positive", "displayOrder 必須為正整數。");
  if (data.internalNotes !== null && (typeof data.internalNotes !== "string" || data.internalNotes.length > 1000)) addIssue(result, "errors", "internalNotes", "notes.length", "internalNotes 最多 1000 字或 null。");
  if (data.publicNotes !== null && (typeof data.publicNotes !== "string" || data.publicNotes.length > 1000)) addIssue(result, "errors", "publicNotes", "notes.length", "publicNotes 最多 1000 字或 null。");
  if (data.coverAssetId !== null && (typeof data.coverAssetId !== "string" || !data.coverAssetId || data.coverAssetId.length > 200)) addIssue(result, "errors", "coverAssetId", "asset.invalid", "coverAssetId 必須為非空字串或 null。");
  if (!Array.isArray(data.galleryAssetIds) || data.galleryAssetIds.length > 30 || new Set(data.galleryAssetIds).size !== data.galleryAssetIds.length) addIssue(result, "errors", "galleryAssetIds", "asset.gallery", "galleryAssetIds 最多 30 個且不得重複。");
  if (data.coverAssetId && (data.galleryAssetIds || []).includes(data.coverAssetId)) addIssue(result, "errors", "galleryAssetIds", "asset.coverRepeated", "相簿不得包含封面 asset ID。");

  const duplicates = detectDuplicateParagraphs(data.description);
  if (duplicates.length) addIssue(result, "warnings", "description", "text.duplicateParagraph", `偵測到 ${duplicates.length} 個完整重複段落。`);
  result.valid = result.errors.length === 0;
  return result;
}

export function validateClassResultCollection(records, options = {}) {
  const result = createValidationResult();
  const ids = new Set();
  const orders = new Set();
  for (const [index, data] of records.entries()) {
    const itemResult = validateClassResult(data, options);
    for (const issue of itemResult.errors) result.errors.push({ ...issue, field: `[${index}].${issue.field}` });
    for (const issue of itemResult.warnings) result.warnings.push({ ...issue, field: `[${index}].${issue.field}` });
    if (ids.has(data.id)) addIssue(result, "errors", `[${index}].id`, "id.duplicate", `班級成果 ID 重複：${data.id}`);
    if (orders.has(data.displayOrder)) addIssue(result, "errors", `[${index}].displayOrder`, "displayOrder.duplicate", `displayOrder 重複：${data.displayOrder}`);
    ids.add(data.id);
    orders.add(data.displayOrder);
  }
  result.valid = result.errors.length === 0;
  return result;
}
