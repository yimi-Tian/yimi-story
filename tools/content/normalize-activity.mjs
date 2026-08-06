import {
  normalizeList,
  normalizeSdgs,
  normalizeText,
  parseBoolean,
  parseNullableInteger,
} from "./normalize-common.mjs";

const DISTRICT_SPLIT = /[、,，/／;；\s]+/;
const KEYWORD_SPLIT = /[、,，;；|\n]+/;
const IMAGE_SPLIT = /[\n;；,，|、]+/;

export function normalizeActivity(input) {
  const sdgs = normalizeSdgs(input.sdgs);
  return {
    data: {
      id: normalizeText(input.id),
      year: Number(input.year),
      name: normalizeText(input.name),
      startDate: normalizeText(input.startDate, { nullable: true }),
      endDate: normalizeText(input.endDate, { nullable: true }),
      dateLabel: normalizeText(input.dateLabel),
      districts: normalizeList(input.districts, { splitPattern: DISTRICT_SPLIT }),
      venue: normalizeText(input.venue),
      projectName: normalizeText(input.projectName, { nullable: true }),
      activityType: normalizeText(input.activityType),
      topic: normalizeText(input.topic),
      sdgs: sdgs.values,
      summary: normalizeText(input.summary),
      participants: parseNullableInteger(input.participants),
      partnerOrganizations: normalizeText(input.partnerOrganizations, { nullable: true }),
      leader: normalizeText(input.leader, { nullable: true }),
      keywords: normalizeList(input.keywords, { splitPattern: KEYWORD_SPLIT }),
      videoUrl: normalizeText(input.videoUrl, { nullable: true }),
      relatedUrl: normalizeText(input.relatedUrl, { nullable: true }),
      featured: parseBoolean(input.featured),
      internalNotes: normalizeText(input.internalNotes, { nullable: true }),
      publicNotes: normalizeText(input.publicNotes, { nullable: true }),
      coverAssetId: normalizeText(input.coverAssetId, { nullable: true }),
      galleryAssetIds: normalizeList(input.galleryAssetIds),
    },
    stats: { sdgCorrectionCount: sdgs.correctionCount, invalidSdgs: sdgs.invalid },
  };
}

function legacyActivityImagePath(value, id) {
  const path = normalizeText(value);
  if (!path) return "";
  if (/^https:\/\//i.test(path) || path.startsWith("public/") || path.startsWith("/images/")) return path;
  if (path.startsWith("images/")) return `/${path}`;
  if (path.includes("/")) return path;
  return `/images/activities/${id}/${path}`;
}

export function normalizeExistingActivity(record) {
  const id = normalizeText(record["活動ID"]);
  const name = normalizeText(record["活動名稱"]);
  const photoPaths = normalizeList(record["成果照片路徑"], { splitPattern: IMAGE_SPLIT })
    .map((path) => legacyActivityImagePath(path, id));
  const coverPath = legacyActivityImagePath(record["封面照片路徑"], id);
  const coverAssetId = coverPath ? `${id}:cover` : null;
  const galleryAssetIds = photoPaths.map((_, index) => `${id}:gallery:${index + 1}`);
  const normalized = normalizeActivity({
    id,
    year: record["年度"],
    name,
    startDate: null,
    endDate: null,
    dateLabel: record["活動日期"],
    districts: record["鄉鎮市區"],
    venue: record["活動地點"],
    projectName: record["計畫名稱"],
    activityType: record["活動類型"],
    topic: record["活動主題"],
    sdgs: record["對應SDGs"],
    summary: record["活動效益摘要"],
    participants: record["參與人次"],
    partnerOrganizations: record["合作單位"],
    leader: record["講師/帶領者"],
    keywords: record["成果關鍵字"],
    videoUrl: record["影片連結"],
    relatedUrl: record["延伸連結"],
    featured: record["是否首頁精選"],
    internalNotes: record["備註"],
    publicNotes: null,
    coverAssetId,
    galleryAssetIds,
  });

  return {
    schemaVersion: "1.0",
    contentType: "activity",
    status: "approved",
    data: normalized.data,
    media: [
      ...(coverPath ? [{
        id: coverAssetId,
        role: "cover",
        sortOrder: 0,
        url: coverPath,
        altText: `${name}封面照片`,
        source: "github_legacy",
      }] : []),
      ...photoPaths.map((url, index) => ({
        id: galleryAssetIds[index],
        role: "gallery",
        sortOrder: index + 1,
        url,
        altText: `${name}成果照片 ${index + 1}`,
        source: "github_legacy",
      })),
    ],
    importStats: { ...normalized.stats, legacyDateUnparsed: true, legacyCoverMissing: !coverPath },
  };
}
