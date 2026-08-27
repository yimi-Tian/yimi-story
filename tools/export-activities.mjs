import { assertNoValidationErrors } from "./content/normalize-common.mjs";
import { stringifyCsv } from "./content/csv.mjs";
import { validateActivityCollection } from "./content/validate-activity.mjs";
import { assertValidImageReference, loadContentSettings } from "./content/validate-image-url.mjs";
import { generateCsvStaticFallback } from "./generate-static-fallback.mjs";
import { projectActivityPublicData } from "./content/public-projection.mjs";

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
    const publicData = projectActivityPublicData(record.data);
    const media = mediaMapFor(record);
    const cover = publicData.coverAssetId ? media.get(publicData.coverAssetId) : null;
    if (!cover && !options.legacyImport) throw new Error(`活動 ${publicData.id} 缺少封面 media。`);
    const gallery = publicData.galleryAssetIds.map((assetId) => media.get(assetId));
    if (gallery.some((asset) => !asset)) throw new Error(`活動 ${publicData.id} 的相簿 media 不完整。`);
    for (const [index, asset] of [cover, ...gallery].filter(Boolean).entries()) {
      await assertValidImageReference(asset.url, {
        settings,
        field: `${publicData.id}.media[${index}]`,
        checkLocalFile: options.checkLocalFiles === true,
        siteRoot: options.siteRoot,
      });
    }
    rows.push({
      活動ID: publicData.id,
      年度: publicData.year,
      活動名稱: publicData.name,
      活動日期: publicData.dateLabel,
      鄉鎮市區: publicData.districts.join("、"),
      活動地點: publicData.venue,
      計畫名稱: publicData.projectName || "",
      活動類型: publicData.activityType,
      活動主題: publicData.topic,
      對應SDGs: publicData.sdgs.map((sdg) => sdg.replace(/^SDG /, "")).join(","),
      活動效益摘要: publicData.summary,
      參與人次: publicData.participants ?? "",
      合作單位: publicData.partnerOrganizations || "",
      "講師/帶領者": publicData.leader || "",
      成果關鍵字: publicData.keywords.join("、"),
      封面照片路徑: cover?.url || "",
      照片資料夾連結: "",
      成果照片路徑: gallery.map((asset) => asset.url).join(","),
      影片連結: publicData.videoUrl || "",
      延伸連結: publicData.relatedUrl || "",
      是否首頁精選: publicData.featured ? "是" : "",
      是否公開: "是",
      備註: publicData.publicNotes || "",
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
