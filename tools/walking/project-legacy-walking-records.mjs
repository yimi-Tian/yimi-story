import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCsv } from "../content/csv.mjs";
import { normalizeExistingActivity } from "../content/normalize-activity.mjs";
import { effectiveWalkingLocation, effectiveWalkingTitle } from "../content/walking-contract.mjs";
import { legacyWalkingFixtures } from "../../tests/content/fixtures/legacy-walking-records.mjs";

export const LEGACY_WALKING_TYPE_PENDING = "PENDING MANUAL CLASSIFICATION";

export const WALKING_SEMANTIC_FIELDS = Object.freeze([
  "id", "title", "year", "date", "townships", "location", "summary", "routeSummary",
  "stops", "fieldNotes", "coverImage", "gallery", "relatedActivityIds", "relatedDigitalWalkIds",
  "publicationStatus", "publiclyListed",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function canonicalizePublicMediaPath(value) {
  const source = text(value).replaceAll("\\", "/");
  if (!source) return "";
  if (/^https:\/\//i.test(source)) {
    const url = new URL(source);
    url.hash = "";
    return url.href;
  }
  return source.replace(/^\.\//, "").replace(/^public\//, "").replace(/^\//, "");
}

export function samePublicMedia(left, right) {
  return canonicalizePublicMediaPath(left) === canonicalizePublicMediaPath(right);
}

export function createActivityMediaResolver(activityRecord) {
  const media = Array.isArray(activityRecord?.media) ? activityRecord.media : [];
  const byId = new Map(media.map((asset) => [asset.id, asset]));
  return Object.freeze({
    resolve(referenceId) {
      const asset = byId.get(referenceId);
      if (!asset?.url) throw new Error(`WALKING_MEDIA_REFERENCE_NOT_OWNED:${referenceId || "missing"}`);
      return asset.url;
    },
    owns(referenceId) {
      return byId.has(referenceId);
    },
    findReferenceByPath(publicPath) {
      return media.find((asset) => samePublicMedia(asset.url, publicPath))?.id ?? null;
    },
  });
}

export function legacyWalkingExtensionFromFixture(fixture, activityRecord, mediaResolver) {
  const coverAssetId = mediaResolver.findReferenceByPath(fixture.coverReference);
  if (!coverAssetId) throw new Error(`WALKING_LEGACY_COVER_NOT_OWNED:${fixture.walkingRecordId}`);
  return {
    type: null,
    titleOverride: fixture.titleOverride,
    locationOverride: fixture.locationOverride,
    summary: fixture.walkingSummary,
    routeSummary: fixture.routeSummary,
    stops: fixture.stops.map((stop) => ({ name: stop.name, note: stop.note })),
    fieldNotes: [...fixture.fieldNotes],
    digitalWalkId: fixture.digitalWalkId,
    coverAssetId,
  };
}

function publicStops(stops) {
  return stops.map((stop) => stop.note === null
    ? { name: stop.name }
    : { name: stop.name, note: stop.note });
}

export function projectWalkingRecord({
  activity,
  walkingExtension,
  walkingRecordId,
  mediaResolver,
  publicationContext,
}) {
  if (!activity || !walkingExtension || !walkingRecordId || !mediaResolver) {
    throw new Error("WALKING_PROJECTION_INPUT_INVALID");
  }
  const aggregate = { ...activity, walkingRecord: walkingExtension };
  const coverReference = walkingExtension.coverAssetId || activity.coverAssetId || activity.galleryAssetIds?.[0] || null;
  if (!coverReference) throw new Error(`WALKING_COVER_REQUIRED:${walkingRecordId}`);
  const coverImage = mediaResolver.resolve(coverReference);
  const gallery = (activity.galleryAssetIds || [])
    .map((referenceId) => mediaResolver.resolve(referenceId))
    .filter((publicPath) => !samePublicMedia(publicPath, coverImage));
  const isPublished = publicationContext?.activityPublished === true;

  return {
    id: walkingRecordId,
    title: effectiveWalkingTitle(aggregate),
    year: activity.year,
    date: activity.dateLabel,
    townships: [...activity.districts],
    location: effectiveWalkingLocation(aggregate),
    summary: walkingExtension.summary,
    type: walkingExtension.type,
    routeSummary: walkingExtension.routeSummary,
    stops: publicStops(walkingExtension.stops),
    fieldNotes: [...walkingExtension.fieldNotes],
    coverImage,
    gallery,
    relatedActivityIds: [activity.id],
    relatedDigitalWalkIds: walkingExtension.digitalWalkId ? [walkingExtension.digitalWalkId] : [],
    publicationStatus: isPublished ? "approved" : "draft",
    publiclyListed: isPublished,
  };
}

function comparableValue(field, value) {
  if (field === "coverImage") return canonicalizePublicMediaPath(value);
  if (field === "gallery") return value.map(canonicalizePublicMediaPath);
  if (field === "stops") return value.map((stop) => ({ name: stop.name, note: stop.note ?? null }));
  return value;
}

export function semanticWalkingDiff(projected, current) {
  return WALKING_SEMANTIC_FIELDS.flatMap((field) => {
    const projectedValue = comparableValue(field, projected[field]);
    const currentValue = comparableValue(field, current[field]);
    return JSON.stringify(projectedValue) === JSON.stringify(currentValue)
      ? []
      : [{ field, projected: projected[field], current: current[field] }];
  });
}

function byteComparable(record) {
  return Object.fromEntries(WALKING_SEMANTIC_FIELDS.map((field) => [field, record[field]]));
}

export function classifyWalkingByteDiff(projected, current) {
  const projectedBytes = `${JSON.stringify(byteComparable(projected), null, 2)}\n`;
  const currentBytes = `${JSON.stringify(byteComparable(current), null, 2)}\n`;
  if (projectedBytes === currentBytes) return "byte-exact";
  return semanticWalkingDiff(projected, current).length === 0 ? "formatting-only" : "semantic-diff";
}

export function generateWalkingFallback(records) {
  return `// Generated from data/walking-records.json by tools/sync-static-data.mjs. Do not edit by hand.\nwindow.WALKING_RECORDS_DATA = ${JSON.stringify(records, null, 2)};\n`;
}

export async function runLegacyWalkingProjectionDryRun(siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")) {
  const [csvText, currentText] = await Promise.all([
    readFile(resolve(siteRoot, "activities.csv"), "utf8"),
    readFile(resolve(siteRoot, "data/walking-records.json"), "utf8"),
  ]);
  const activityRows = parseCsv(csvText);
  const activityRecords = new Map(activityRows.map((row) => {
    const record = normalizeExistingActivity(row);
    return [record.data.id, { record, published: row["是否公開"] === "是" }];
  }));
  const currentRecords = JSON.parse(currentText);
  const currentById = new Map(currentRecords.map((record) => [record.id, record]));
  const rows = [];

  for (const fixture of legacyWalkingFixtures) {
    const activityEntry = activityRecords.get(fixture.activityPublicId);
    if (!activityEntry) throw new Error(`WALKING_ACTIVITY_NOT_FOUND:${fixture.activityPublicId}`);
    const current = currentById.get(fixture.walkingRecordId);
    if (!current) throw new Error(`WALKING_CURRENT_RECORD_NOT_FOUND:${fixture.walkingRecordId}`);
    const mediaResolver = createActivityMediaResolver(activityEntry.record);
    const walkingExtension = legacyWalkingExtensionFromFixture(fixture, activityEntry.record, mediaResolver);
    const projected = projectWalkingRecord({
      activity: activityEntry.record.data,
      walkingExtension,
      walkingRecordId: fixture.walkingRecordId,
      mediaResolver,
      publicationContext: { activityPublished: activityEntry.published },
    });
    const semanticDiff = semanticWalkingDiff(projected, current);
    const referencedMedia = [walkingExtension.coverAssetId, ...activityEntry.record.data.galleryAssetIds];
    const mediaOwnershipValid = referencedMedia.every((referenceId) => mediaResolver.owns(referenceId));
    rows.push({
      walkingRecordId: fixture.walkingRecordId,
      activityPublicId: fixture.activityPublicId,
      projected,
      current,
      semanticDiff,
      semanticMatch: semanticDiff.length === 0,
      byteClassification: classifyWalkingByteDiff(projected, current),
      mediaOwnershipValid,
      typeStatus: walkingExtension.type === null ? LEGACY_WALKING_TYPE_PENDING : walkingExtension.type,
    });
  }

  if (currentRecords.length !== rows.length) throw new Error("WALKING_CURRENT_COLLECTION_COUNT_MISMATCH");
  return {
    mode: "dry-run",
    rows,
    projectedRecords: rows.map((row) => row.projected),
    summary: {
      records: rows.length,
      semanticMatches: rows.filter((row) => row.semanticMatch).length,
      byteExact: rows.filter((row) => row.byteClassification === "byte-exact").length,
      formattingOnly: rows.filter((row) => row.byteClassification === "formatting-only").length,
      mediaOwnershipValid: rows.filter((row) => row.mediaOwnershipValid).length,
      typePendingManualClassification: rows.filter((row) => row.typeStatus === LEGACY_WALKING_TYPE_PENDING).length,
    },
  };
}

function printReport(report) {
  const lines = ["Legacy Walking Projection Dry Run", ""];
  for (const row of report.rows) lines.push(`${row.walkingRecordId}  ${row.semanticMatch ? "MATCH" : "DIFF"}`);
  lines.push(
    "",
    "Summary:",
    `${report.summary.records} records`,
    `${report.summary.semanticMatches} semantic matches`,
    `${report.summary.byteExact} byte-exact`,
    `${report.summary.formattingOnly} formatting-only`,
    `${report.summary.mediaOwnershipValid} media ownership valid`,
    `${report.summary.typePendingManualClassification} type pending manual classification`,
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  if (process.argv.includes("--apply")) throw new Error("WB4A dry-run does not support --apply");
  const report = await runLegacyWalkingProjectionDryRun();
  process.stdout.write(printReport(report));
  if (report.summary.semanticMatches !== report.summary.records || report.summary.mediaOwnershipValid !== report.summary.records) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
