export const FORMAL_FILE_ALLOWLIST = [
  "data/class-results.json",
  "data/class-results-data.js",
  "activities.csv",
  "activities-data.js",
  "data/platform-home.json",
  "data/platform-home-data.js",
] as const;

export type FormalFilePath = typeof FORMAL_FILE_ALLOWLIST[number];
export type ContentType = "class_result" | "activity";

export type SnapshotMediaEntry = {
  mediaId: string;
  role: "cover" | "gallery";
  sortOrder: number;
  source: "github_legacy" | "cms_draft";
  legacyPath: string | null;
};

export type PublicMediaEntry = {
  sourceMediaId: string;
  publicMediaId: string | null;
  role: "cover" | "gallery";
  sortOrder: number;
  publicSource: "github_legacy" | "cms_public";
  publicPath: string;
  sha256: string | null;
  metadata: Record<string, unknown>;
};

export type FormalPublicationInput = {
  contentType: ContentType;
  publicId: string;
  publicData: Record<string, unknown>;
  snapshotMediaManifest: SnapshotMediaEntry[];
  publicMediaManifest: PublicMediaEntry[];
  publicStorageBaseUrl: string;
  baselineFiles: Record<FormalFilePath, string>;
};

export type FormalPublicationResult = {
  files: Record<FormalFilePath, string>;
  changedFiles: FormalFilePath[];
  changeType: "new" | "update";
  beforeCounts: { classResults: number; activities: number };
  afterCounts: { classResults: number; activities: number };
  mediaCount: number;
};

export const ACTIVITY_CSV_HEADERS = [
  "活動ID", "年度", "活動名稱", "活動日期", "鄉鎮市區", "活動地點", "計畫名稱",
  "活動類型", "活動主題", "對應SDGs", "活動效益摘要", "參與人次", "合作單位",
  "講師/帶領者", "成果關鍵字", "封面照片路徑", "照片資料夾連結",
  "成果照片路徑", "影片連結", "延伸連結", "是否首頁精選", "是否公開", "備註",
] as const;

const TECHNICAL_KEYS = new Set([
  "internalNotes", "snapshotId", "draftId", "preparationId", "mappingId", "mediaId",
  "sourceMediaId", "publicMediaId", "createdBy", "updatedBy", "adminId", "checksumSha256",
]);

function fail(code: string): never {
  throw new Error(code);
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const result = text(value).trim();
  return result || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text) : [];
}

function naturalIdCompare(left: string, right: string): number {
  const a = left.match(/\d+|\D+/gu) ?? [left];
  const b = right.match(/\d+|\D+/gu) ?? [right];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    if (a[index] === b[index]) continue;
    const aNumber = /^\d+$/u.test(a[index]) ? Number(a[index]) : null;
    const bNumber = /^\d+$/u.test(b[index]) ? Number(b[index]) : null;
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return aNumber - bNumber;
    return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function parseCsv(sourceValue: string): Array<Record<string, string>> {
  const source = sourceValue.replace(/^\uFEFF/u, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\r" || character === "\n") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) fail("CANONICAL_CSV_INVALID");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) fail("CANONICAL_CSV_INVALID");
  const headers = rows.shift()!;
  if (JSON.stringify(headers) !== JSON.stringify(ACTIVITY_CSV_HEADERS)) fail("CANONICAL_CSV_SCHEMA_MISMATCH");
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function escapeCsv(value: unknown): string {
  const result = text(value);
  return /[",\r\n]/u.test(result) ? `"${result.replaceAll('"', '""')}"` : result;
}

export function stringifyActivitiesCsv(records: Array<Record<string, unknown>>): string {
  const lines = [ACTIVITY_CSV_HEADERS.join(",")];
  for (const record of records) lines.push(ACTIVITY_CSV_HEADERS.map((header) => escapeCsv(record[header])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function generateClassResultsDataJs(data: unknown[]): string {
  return `// Generated from data/class-results.json by tools/sync-static-data.mjs. Do not edit by hand.\nwindow.CLASS_RESULTS_DATA = ${JSON.stringify(data, null, 2)};\n`;
}

export function generateActivitiesDataJs(csv: string): string {
  const embedded = csv.replaceAll("\r\n", "\n").replaceAll("`", "\\`").replaceAll("${", "\\${");
  return `window.ACTIVITIES_CSV = \`${embedded}\`;\n`;
}

export function generatePlatformHomeDataJs(data: Record<string, unknown>): string {
  return `window.PLATFORM_HOME_DATA = ${JSON.stringify(data, null, 2)}\n;\n`;
}

export function buildPlatformHomePublication(
  baseline: Record<string, unknown>,
  activityCount: number,
): Record<string, unknown> {
  const output = structuredClone(baseline);
  if (!Array.isArray(output.platformStats)) fail("HOMEPAGE_SCHEMA_MISMATCH");
  const activity = output.platformStats.find((entry) =>
    entry && typeof entry === "object" && (entry as Record<string, unknown>).label === "活動成果"
  ) as Record<string, unknown> | undefined;
  if (!activity) fail("HOMEPAGE_SCHEMA_MISMATCH");
  activity.value = String(activityCount);
  return output;
}

function publicUrl(baseUrl: string, entry: PublicMediaEntry): string {
  if (entry.publicSource === "github_legacy") {
    if (!entry.publicPath || /^https?:/iu.test(entry.publicPath)) fail("LEGACY_PATH_INVALID");
    return entry.publicPath;
  }
  if (!/^https:\/\//u.test(baseUrl) || !entry.publicPath || /(?:^|\/)cms-drafts(?:\/|$)/iu.test(entry.publicPath)) {
    fail("PUBLIC_MEDIA_URL_INVALID");
  }
  const path = entry.publicPath.split("/").map(encodeURIComponent).join("/");
  const result = `${baseUrl.replace(/\/+$/u, "")}/${path}`;
  if (/token=/iu.test(result) || !result.includes("/storage/v1/object/public/cms-public/")) fail("PUBLIC_MEDIA_URL_INVALID");
  return result;
}

function resolveMedia(input: FormalPublicationInput): Array<{ role: "cover" | "gallery"; sortOrder: number; url: string; altText: string }> {
  const expected = [...input.snapshotMediaManifest].sort((left, right) =>
    (left.role === right.role ? left.sortOrder - right.sortOrder : left.role === "cover" ? -1 : 1)
  );
  const actual = [...input.publicMediaManifest].sort((left, right) =>
    (left.role === right.role ? left.sortOrder - right.sortOrder : left.role === "cover" ? -1 : 1)
  );
  if (expected.length !== actual.length) fail("MEDIA_MAPPING_INCOMPLETE");
  return expected.map((source, index) => {
    const target = actual[index];
    if (!target || target.sourceMediaId !== source.mediaId || target.role !== source.role || target.sortOrder !== source.sortOrder) {
      fail("MEDIA_MAPPING_MISMATCH");
    }
    const expectedSource = source.source === "github_legacy" ? "github_legacy" : "cms_public";
    if (target.publicSource !== expectedSource) fail("MEDIA_MAPPING_MISMATCH");
    return {
      role: target.role,
      sortOrder: target.sortOrder,
      url: publicUrl(input.publicStorageBaseUrl, target),
      altText: text(target.metadata.altText),
    };
  });
}

export function buildClassResultPublication(
  publicData: Record<string, unknown>,
  media: ReturnType<typeof resolveMedia>,
): Record<string, unknown> {
  const cover = media.find((entry) => entry.role === "cover");
  const gallery = media.filter((entry) => entry.role === "gallery").sort((a, b) => a.sortOrder - b.sortOrder);
  const displayCover = cover ?? gallery[0];
  if (!displayCover) fail("PUBLIC_COVER_REQUIRED");
  return {
    id: text(publicData.id),
    year: Number(publicData.year),
    title: text(publicData.title),
    className: text(publicData.className),
    instructor: text(publicData.instructor),
    description: text(publicData.description),
    districts: stringArray(publicData.districts),
    venue: text(publicData.venue),
    photoFolder: text(publicData.id),
    coverImage: displayCover.url,
    coverImageAlt: displayCover.altText,
    images: gallery.map((entry) => entry.url),
    imageAlts: gallery.map((entry) => entry.altText),
    publicationStatus: "approved",
    tags: stringArray(publicData.tags),
    sdgs: stringArray(publicData.sdgs),
    displayOrder: Number(publicData.displayOrder),
    publicNotes: optionalText(publicData.publicNotes),
  };
}

export function buildActivityPublication(
  publicData: Record<string, unknown>,
  media: ReturnType<typeof resolveMedia>,
): Record<string, unknown> {
  const cover = media.find((entry) => entry.role === "cover");
  const gallery = media.filter((entry) => entry.role === "gallery").sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    活動ID: text(publicData.id),
    年度: Number(publicData.year),
    活動名稱: text(publicData.name),
    活動日期: text(publicData.dateLabel),
    鄉鎮市區: stringArray(publicData.districts).join("、"),
    活動地點: text(publicData.venue),
    計畫名稱: text(publicData.projectName),
    活動類型: text(publicData.activityType),
    活動主題: text(publicData.topic),
    對應SDGs: stringArray(publicData.sdgs).map((value) => value.replace(/^SDG /u, "")).join(","),
    活動效益摘要: text(publicData.summary),
    參與人次: publicData.participants ?? "",
    合作單位: text(publicData.partnerOrganizations),
    "講師/帶領者": text(publicData.leader),
    成果關鍵字: stringArray(publicData.keywords).join("、"),
    封面照片路徑: cover?.url ?? "",
    照片資料夾連結: "",
    成果照片路徑: gallery.map((entry) => entry.url).join(","),
    影片連結: optionalText(publicData.videoUrl) ?? "",
    延伸連結: optionalText(publicData.relatedUrl) ?? "",
    是否首頁精選: publicData.featured === true ? "是" : "",
    是否公開: "是",
    備註: optionalText(publicData.publicNotes) ?? "",
  };
}

function assertUnique(records: Array<Record<string, unknown>>, key: string): void {
  const values = records.map((record) => text(record[key]));
  if (values.some((value) => !value) || new Set(values).size !== values.length) fail("DUPLICATE_PUBLIC_ID");
}

function assertNoTechnicalFields(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoTechnicalFields(item);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (TECHNICAL_KEYS.has(key)) fail(key === "internalNotes" ? "INTERNAL_NOTES_LEAK" : "TECHNICAL_FIELD_LEAK");
    assertNoTechnicalFields(child);
  }
}

export function buildFormalPublication(input: FormalPublicationInput): FormalPublicationResult {
  if (!FORMAL_FILE_ALLOWLIST.every((path) => typeof input.baselineFiles[path] === "string")) fail("FORMAL_BASELINE_INCOMPLETE");
  if (text(input.publicData.id) !== input.publicId) fail("PUBLIC_ID_MISMATCH");
  assertNoTechnicalFields(input.publicData);
  const classes = JSON.parse(input.baselineFiles["data/class-results.json"]) as Array<Record<string, unknown>>;
  const activities = parseCsv(input.baselineFiles["activities.csv"]);
  const homepage = JSON.parse(input.baselineFiles["data/platform-home.json"]) as Record<string, unknown>;
  if (!Array.isArray(classes) || !homepage || typeof homepage !== "object") fail("FORMAL_BASELINE_INVALID");
  assertUnique(classes, "id");
  assertUnique(activities, "活動ID");
  const beforeCounts = { classResults: classes.length, activities: activities.length };
  const media = resolveMedia(input);
  let changeType: "new" | "update";

  if (input.contentType === "class_result") {
    const index = classes.findIndex((record) => record.id === input.publicId);
    changeType = index < 0 ? "new" : "update";
    const candidate = buildClassResultPublication(input.publicData, media);
    if (index < 0) classes.push(candidate); else classes[index] = candidate;
    classes.sort((left, right) => Number(left.displayOrder) - Number(right.displayOrder) || naturalIdCompare(text(left.id), text(right.id)));
  } else {
    const index = activities.findIndex((record) => record.活動ID === input.publicId);
    changeType = index < 0 ? "new" : "update";
    const candidate = buildActivityPublication(input.publicData, media) as Record<string, string>;
    if (index < 0) activities.push(candidate); else activities[index] = candidate;
    activities.sort((left, right) => naturalIdCompare(left.活動ID, right.活動ID));
  }

  assertUnique(classes, "id");
  assertUnique(activities, "活動ID");
  const afterCounts = { classResults: classes.length, activities: activities.length };
  const expectedIncrement = changeType === "new" ? 1 : 0;
  if (afterCounts.classResults !== beforeCounts.classResults + (input.contentType === "class_result" ? expectedIncrement : 0) ||
    afterCounts.activities !== beforeCounts.activities + (input.contentType === "activity" ? expectedIncrement : 0)) {
    fail("RECORD_COUNT_MISMATCH");
  }

  const files = { ...input.baselineFiles };
  if (input.contentType === "class_result") {
    files["data/class-results.json"] = `${JSON.stringify(classes, null, 2)}\n`;
    files["data/class-results-data.js"] = generateClassResultsDataJs(classes);
  } else {
    files["activities.csv"] = stringifyActivitiesCsv(activities);
    files["activities-data.js"] = generateActivitiesDataJs(files["activities.csv"]);
  }
  const nextHomepage = afterCounts.activities === beforeCounts.activities
    ? homepage
    : buildPlatformHomePublication(homepage, afterCounts.activities);
  if (afterCounts.activities !== beforeCounts.activities) {
    files["data/platform-home.json"] = `${JSON.stringify(nextHomepage, null, 2)}\n`;
    files["data/platform-home-data.js"] = generatePlatformHomeDataJs(nextHomepage);
  }
  assertNoTechnicalFields(classes);
  assertNoTechnicalFields(activities);
  assertNoTechnicalFields(nextHomepage);
  const changedFiles = FORMAL_FILE_ALLOWLIST.filter((path) => files[path] !== input.baselineFiles[path]);
  if (!changedFiles.length || changedFiles.length > FORMAL_FILE_ALLOWLIST.length) fail("UNEXPECTED_FORMAL_DIFF");
  return { files, changedFiles, changeType, beforeCounts, afterCounts, mediaCount: media.length };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
