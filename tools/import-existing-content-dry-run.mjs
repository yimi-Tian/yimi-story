import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./content/csv.mjs";
import { normalizeExistingActivity } from "./content/normalize-activity.mjs";
import { normalizeExistingClassResult } from "./content/normalize-class-result.mjs";
import { validateActivityCollection } from "./content/validate-activity.mjs";
import { validateClassResultCollection } from "./content/validate-class-result.mjs";
import { classifyImageReference, loadContentSettings, validateImageReference } from "./content/validate-image-url.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function runExistingContentDryRun(options = {}) {
  const root = options.siteRoot || siteRoot;
  const settings = options.settings || await loadContentSettings(resolve(root, "config/content-settings.json"));
  const classSource = JSON.parse(await readFile(resolve(root, "data/class-results.json"), "utf8"));
  const activitySource = parseCsv(await readFile(resolve(root, "activities.csv"), "utf8"));
  const classResults = classSource.map(normalizeExistingClassResult);
  const activities = activitySource.map(normalizeExistingActivity);
  const classValidation = validateClassResultCollection(classResults.map((record) => record.data), { settings, legacyImport: true });
  const activityValidation = validateActivityCollection(activities.map((record) => record.data), { settings, legacyImport: true });
  const allRecords = [...classResults, ...activities];
  let relativeImageCount = 0;
  let httpsImageCount = 0;
  const imageErrors = [];
  for (const record of allRecords) {
    for (const asset of record.media) {
      const classified = classifyImageReference(asset.url);
      if (classified.kind === "url" && classified.url?.protocol === "https:") httpsImageCount += 1;
      else if (classified.kind === "relative") relativeImageCount += 1;
      const validation = await validateImageReference(asset.url, {
        settings,
        siteRoot: root,
        checkLocalFile: true,
        field: `${record.data.id}.${asset.id}`,
      });
      imageErrors.push(...validation.errors);
    }
  }

  const ids = allRecords.map((record) => `${record.contentType}:${record.data.id}`);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const warnings = [...classValidation.warnings, ...activityValidation.warnings];
  for (const record of activities) {
    if (record.importStats.legacyCoverMissing) {
      warnings.push({
        field: `${record.data.id}.coverAssetId`,
        code: "legacyImport.coverMissing",
        message: "既有 CSV 封面路徑為空，保留空值並由現有前台 fallback 處理。",
      });
    }
  }
  const errors = [...classValidation.errors, ...activityValidation.errors, ...imageErrors];
  const report = {
    classResultSourceCount: classSource.length,
    classResultSuccessCount: classResults.length - classValidation.errors.length,
    activitySourceCount: activitySource.length,
    activitySuccessCount: activities.length - activityValidation.errors.length,
    unparsedLegacyDateCount: activities.filter((record) => record.data.startDate === null).length,
    legacyImportWarningCount: warnings.filter((issue) => issue.code.startsWith("legacyImport.")).length,
    duplicateIds,
    requiredFieldErrorCount: errors.filter((issue) => issue.code === "string.length" || issue.code.endsWith(".required")).length,
    validationErrorCount: errors.length,
    validationWarningCount: warnings.length,
    sdgCorrectionCount: allRecords.reduce((total, record) => total + (record.importStats?.sdgCorrectionCount || 0), 0),
    duplicateParagraphWarningCount: warnings.filter((issue) => issue.code === "text.duplicateParagraph").length,
    internalNotesImportCount: allRecords.filter((record) => record.data.internalNotes !== null).length,
    relativeImageCount,
    httpsImageCount,
    errors,
    warnings,
  };
  return { report, classResults, activities, classSource, activitySource };
}

async function main() {
  const { report } = await runExistingContentDryRun();
  console.log(JSON.stringify(report, null, 2));
  if (report.validationErrorCount) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
