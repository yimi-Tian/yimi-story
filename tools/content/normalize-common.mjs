export function normalizeText(value, { nullable = false } = {}) {
  if (value === undefined || value === null) return nullable ? null : "";
  const normalized = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
  return nullable && !normalized ? null : normalized;
}

export function normalizeList(values, { splitPattern = null } = {}) {
  const input = Array.isArray(values) ? values : splitPattern ? String(values ?? "").split(splitPattern) : [values];
  const seen = new Set();
  const result = [];
  for (const value of input) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function normalizeSdgs(values) {
  const input = Array.isArray(values)
    ? values
    : String(values ?? "").split(/[、,，;；|/\s]+/);
  const normalized = [];
  const invalid = [];
  let correctionCount = 0;

  for (const rawValue of input) {
    const raw = normalizeText(rawValue);
    if (!raw) continue;
    const match = raw.match(/^(?:sdg\s*)?0?(\d{1,2})$/i);
    const number = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(number) || number < 1 || number > 17) {
      invalid.push(raw);
      continue;
    }
    const value = `SDG ${number}`;
    if (raw !== value) correctionCount += 1;
    if (!normalized.includes(value)) normalized.push(value);
  }

  return { values: normalized, invalid, correctionCount };
}

export function detectDuplicateParagraphs(value) {
  const paragraphs = normalizeText(value)
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const seen = new Set();
  const duplicates = [];
  for (const paragraph of paragraphs) {
    if (seen.has(paragraph) && !duplicates.includes(paragraph)) duplicates.push(paragraph);
    seen.add(paragraph);
  }
  return duplicates;
}

export function parseNullableInteger(value) {
  const normalized = normalizeText(value, { nullable: true });
  if (normalized === null) return null;
  if (!/^-?\d+$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

export function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value).toLowerCase();
  return ["是", "true", "1", "yes", "y"].includes(normalized);
}

export function isStrictIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatActivityDateLabel(startDate, endDate = null) {
  if (!isStrictIsoDate(startDate)) throw new Error(`startDate 不是有效 ISO 日期：${startDate}`);
  if (endDate !== null && !isStrictIsoDate(endDate)) throw new Error(`endDate 不是有效 ISO 日期：${endDate}`);
  if (endDate !== null && endDate < startDate) throw new Error("endDate 不得早於 startDate。");

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  if (!endDate || endDate === startDate) return `${startMonth}/${startDay}`;
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  if (startYear === endYear) return `${startMonth}/${startDay}～${endMonth}/${endDay}`;
  return `${startYear}/${startMonth}/${startDay}～${endYear}/${endMonth}/${endDay}`;
}

export function createValidationResult() {
  return { valid: true, errors: [], warnings: [] };
}

export function addIssue(result, level, field, code, message) {
  result[level].push({ field, code, message });
  result.valid = result.errors.length === 0;
}

export function mergeValidationResults(...results) {
  const merged = createValidationResult();
  for (const result of results) {
    if (!result) continue;
    merged.errors.push(...(result.errors || []));
    merged.warnings.push(...(result.warnings || []));
  }
  merged.valid = merged.errors.length === 0;
  return merged;
}

export function assertNoValidationErrors(result, label = "內容") {
  if (result.valid) return;
  const details = result.errors.map((issue) => `${issue.field}: ${issue.message}`).join("\n");
  throw new Error(`${label}驗證失敗：\n${details}`);
}
