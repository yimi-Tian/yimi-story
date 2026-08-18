import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runExistingContentDryRun } from "../import-existing-content-dry-run.mjs";
import { canonicalStringify, sha256Hex, snapshotChecksum } from "./canonical-json.mjs";
import { readLegacyImageMetadata } from "./media-metadata.mjs";

const defaultSiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function buildBaselinePlan(options = {}) {
  const siteRoot = options.siteRoot || defaultSiteRoot;
  const dryRun = await runExistingContentDryRun({ siteRoot });
  if (dryRun.report.validationErrorCount || dryRun.report.duplicateIds.length) {
    throw new Error(`既有內容未通過驗證：errors=${dryRun.report.validationErrorCount}, duplicates=${dryRun.report.duplicateIds.length}`);
  }
  const metadataCache = new Map();
  const readMetadata = async (legacyPath) => {
    if (!metadataCache.has(legacyPath)) metadataCache.set(legacyPath, readLegacyImageMetadata(siteRoot, legacyPath));
    return metadataCache.get(legacyPath);
  };
  const sourceRecords = [...dryRun.classResults, ...dryRun.activities]
    .sort((left, right) => `${left.contentType}:${left.data.id}`.localeCompare(`${right.contentType}:${right.data.id}`, "en"));
  const records = [];
  for (const record of sourceRecords) {
    const media = [];
    for (const asset of record.media) {
      media.push({ stableAssetKey: asset.id, role: asset.role, sortOrder: asset.sortOrder, legacyPath: asset.url, altText: asset.altText || "", ...await readMetadata(asset.url) });
    }
    const mediaManifest = media.map((asset) => ({ assetId: asset.stableAssetKey, role: asset.role, sortOrder: asset.sortOrder, legacyPath: asset.legacyPath, altText: asset.altText, sha256: asset.sha256 }));
    const snapshotData = record.data;
    const checksumSha256 = snapshotChecksum({ schemaVersion: record.schemaVersion, snapshotData, mediaManifest });
    records.push({ contentType: record.contentType, publicId: record.data.id, schemaVersion: record.schemaVersion, snapshotData, mediaManifest, checksumSha256, media });
  }
  const report = {
    classResultCount: records.filter((record) => record.contentType === "class_result").length,
    activityCount: records.filter((record) => record.contentType === "activity").length,
    contentItemCount: records.length,
    snapshotCount: records.length,
    mediaAssetCount: records.reduce((count, record) => count + record.media.length, 0),
    contentDraftCount: 0,
    githubPublicationCount: 0,
    validationErrorCount: dryRun.report.validationErrorCount,
    duplicateIdCount: dryRun.report.duplicateIds.length,
    legacyWarningCount: dryRun.report.validationWarningCount,
    unparsedLegacyDateCount: dryRun.report.unparsedLegacyDateCount,
    outsideServiceAreaWarningCount: dryRun.report.warnings.filter((issue) => issue.code === "legacyImport.district").length,
    missingCoverWarningCount: dryRun.report.warnings.filter((issue) => issue.code === "legacyImport.coverMissing").length,
    internalNotesImportCount: dryRun.report.internalNotesImportCount,
    aggregateChecksumSha256: sha256Hex(canonicalStringify(records.map((record) => ({ contentType: record.contentType, publicId: record.publicId, checksumSha256: record.checksumSha256 })))),
  };
  return { records, report, sources: { classSource: dryRun.classSource, activitySource: dryRun.activitySource } };
}

export function publicationRecordFromBaseline(record) {
  return {
    schemaVersion: record.schemaVersion,
    contentType: record.contentType,
    status: "approved",
    data: record.snapshotData,
    media: record.mediaManifest.map((asset) => ({ id: asset.assetId, role: asset.role, sortOrder: asset.sortOrder, url: asset.legacyPath, altText: asset.altText, source: "github_legacy" })),
  };
}
