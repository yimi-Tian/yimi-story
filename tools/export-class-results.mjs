import { assertNoValidationErrors } from "./content/normalize-common.mjs";
import { validateClassResultCollection } from "./content/validate-class-result.mjs";
import { assertValidImageReference, loadContentSettings } from "./content/validate-image-url.mjs";
import { generateJsonStaticFallback } from "./generate-static-fallback.mjs";

function mediaMapFor(record) {
  return new Map((record.media || []).map((asset) => [asset.id, asset]));
}

export async function exportClassResults(records, options = {}) {
  const settings = options.settings || await loadContentSettings(options.settingsPath);
  const sorted = [...records].sort((left, right) => {
    const orderDifference = Number(left.data.displayOrder) - Number(right.data.displayOrder);
    return orderDifference || left.data.id.localeCompare(right.data.id, "en", { numeric: true });
  });
  const collectionResult = validateClassResultCollection(sorted.map((record) => record.data), { settings });
  assertNoValidationErrors(collectionResult, "班級成果");

  const published = [];
  for (const record of sorted) {
    if (record.status !== "approved" || record.contentType !== "class_result") throw new Error(`班級成果 ${record.data?.id || "unknown"} 不是 approved class_result。`);
    const media = mediaMapFor(record);
    const cover = media.get(record.data.coverAssetId);
    if (!cover) throw new Error(`班級成果 ${record.data.id} 缺少封面 media。`);
    const gallery = record.data.galleryAssetIds.map((assetId) => media.get(assetId));
    if (gallery.some((asset) => !asset)) throw new Error(`班級成果 ${record.data.id} 的相簿 media 不完整。`);
    for (const [index, asset] of [cover, ...gallery].entries()) {
      await assertValidImageReference(asset.url, {
        settings,
        field: `${record.data.id}.media[${index}]`,
        checkLocalFile: options.checkLocalFiles === true,
        siteRoot: options.siteRoot,
      });
    }
    published.push({
      id: record.data.id,
      year: record.data.year,
      title: record.data.title,
      className: record.data.className,
      instructor: record.data.instructor,
      description: record.data.description,
      districts: record.data.districts,
      venue: record.data.venue,
      photoFolder: record.data.id,
      coverImage: cover.url,
      coverImageAlt: cover.altText,
      images: gallery.map((asset) => asset.url),
      imageAlts: gallery.map((asset) => asset.altText),
      publicationStatus: "approved",
      tags: record.data.tags,
      sdgs: record.data.sdgs,
      displayOrder: record.data.displayOrder,
      publicNotes: record.data.publicNotes,
    });
  }

  const jsonText = `${JSON.stringify(published, null, 2)}\n`;
  return {
    published,
    jsonText,
    fallbackText: generateJsonStaticFallback({
      sourcePath: "data/class-results.json",
      globalName: "CLASS_RESULTS_DATA",
      data: published,
    }),
    validation: collectionResult,
  };
}
