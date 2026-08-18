import { assertNoValidationErrors, formatActivityDateLabel } from "./content/normalize-common.mjs";
import { stringifyCsv } from "./content/csv.mjs";
import { validateActivityCollection } from "./content/validate-activity.mjs";
import { assertValidImageReference, loadContentSettings } from "./content/validate-image-url.mjs";
import { generateCsvStaticFallback } from "./generate-static-fallback.mjs";

export const ACTIVITY_CSV_HEADERS = [
  "活動ID",
  "年度",
  "活動名稱",
  "活動日期",
  "鄉鎮市區",
  "活動地點",
  "計畫名稱",
  "活動類型",
  "活動主題",
  "對應SDGs",
  "活動效益摘要",
  "參與人次",
  "合作單位",
  "講師/帶領者",
  "成果關鍵字",
  "封面照片路徑",
  "照片資料夾連結",
  "成果照片路徑",
  "影片連結",
  "延伸連結",
  "是否首頁精選",
  "是否公開",
  "備註",
];

function mediaMapFor(record) {
  return new Map((record.media || []).map((asset) => [asset.id, asset]));
}

export async function exportActivities(records, options = {}) {
  const settings = options.settings || await loadContentSettings(options.settingsPath);
  const sorted = [...records].sort((left, right) => left.data.id.localeCompare(right.data.id, "en", { numeric: true }));
  const collectionResult = validateActivityCollection(sorted.map((record) => record.data), { settings, legacyImport: options.legacyImport === true });
  assertNoValidationErrors(collectionResult, "活動");

  const rows = [];
  for (const record of sorted) {
    if (record.status !== "approved" || record.contentType !== "activity") throw new Error(`活動 ${record.data?.id || "unknown"} 不是 approved activity。`);
    const media = mediaMapFor(record);
    const cover = record.data.coverAssetId ? media.get(record.data.coverAssetId) : null;
    if (!cover && !options.legacyImport) throw new Error(`活動 ${record.data.id} 缺少封面 media。`);
    const gallery = record.data.galleryAssetIds.map((assetId) => media.get(assetId));
    if (gallery.some((asset) => !asset)) throw new Error(`活動 ${record.data.id} 的相簿 media 不完整。`);
    for (const [index, asset] of [cover, ...gallery].filter(Boolean).entries()) {
      await assertValidImageReference(asset.url, {
        settings,
        field: `${record.data.id}.media[${index}]`,
        checkLocalFile: options.checkLocalFiles === true,
        siteRoot: options.siteRoot,
      });
    }
    const dateLabel = record.data.startDate
      ? formatActivityDateLabel(record.data.startDate, record.data.endDate)
      : record.data.dateLabel;
    rows.push({
      活動ID: record.data.id,
      年度: record.data.year,
      活動名稱: record.data.name,
      活動日期: dateLabel,
      鄉鎮市區: record.data.districts.join("、"),
      活動地點: record.data.venue,
      計畫名稱: record.data.projectName || "",
      活動類型: record.data.activityType,
      活動主題: record.data.topic,
      對應SDGs: record.data.sdgs.map((sdg) => sdg.replace(/^SDG /, "")).join(","),
      活動效益摘要: record.data.summary,
      參與人次: record.data.participants ?? "",
      合作單位: record.data.partnerOrganizations || "",
      "講師/帶領者": record.data.leader || "",
      成果關鍵字: record.data.keywords.join("、"),
      封面照片路徑: cover?.url || "",
      照片資料夾連結: "",
      成果照片路徑: gallery.map((asset) => asset.url).join(","),
      影片連結: record.data.videoUrl || "",
      延伸連結: record.data.relatedUrl || "",
      是否首頁精選: record.data.featured ? "是" : "",
      是否公開: "是",
      備註: record.data.publicNotes || "",
    });
  }

  const csvText = stringifyCsv(ACTIVITY_CSV_HEADERS, rows);
  return {
    rows,
    csvText,
    fallbackText: generateCsvStaticFallback(csvText),
    validation: collectionResult,
  };
}
