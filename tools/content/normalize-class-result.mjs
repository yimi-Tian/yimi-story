import { normalizeList, normalizeSdgs, normalizeText, parseNullableInteger } from "./normalize-common.mjs";

export function normalizeClassResult(input) {
  const sdgs = normalizeSdgs(input.sdgs);
  return {
    data: {
      id: normalizeText(input.id),
      year: Number(input.year),
      title: normalizeText(input.title),
      className: normalizeText(input.className),
      instructor: normalizeText(input.instructor),
      description: normalizeText(input.description),
      districts: normalizeList(input.districts),
      venue: normalizeText(input.venue),
      tags: normalizeList(input.tags),
      sdgs: sdgs.values,
      displayOrder: parseNullableInteger(input.displayOrder),
      internalNotes: normalizeText(input.internalNotes, { nullable: true }),
      publicNotes: normalizeText(input.publicNotes, { nullable: true }),
      coverAssetId: normalizeText(input.coverAssetId, { nullable: true }),
      galleryAssetIds: normalizeList(input.galleryAssetIds),
    },
    stats: { sdgCorrectionCount: sdgs.correctionCount, invalidSdgs: sdgs.invalid },
  };
}

export function normalizeExistingClassResult(input) {
  const id = normalizeText(input.id);
  const yearMatch = id.match(/^CR-(\d{3})-\d{3}$/);
  const title = normalizeText(input.title);
  const images = Array.isArray(input.images) ? input.images : [];
  const coverAssetId = `${id}:cover`;
  const galleryAssetIds = images.map((_, index) => `${id}:gallery:${index + 1}`);
  const normalized = normalizeClassResult({
    id,
    year: yearMatch ? Number(yearMatch[1]) : Number.NaN,
    title,
    className: input.className,
    instructor: input.instructor,
    description: input.description,
    districts: input.districts,
    venue: input.venue,
    tags: input.tags,
    sdgs: input.sdgs,
    displayOrder: input.displayOrder,
    internalNotes: input.remarks,
    publicNotes: input.publicNotes,
    coverAssetId,
    galleryAssetIds,
  });

  const media = [
    {
      id: coverAssetId,
      role: "cover",
      sortOrder: 0,
      url: normalizeText(input.coverImage),
      altText: normalizeText(input.coverImageAlt) || `${title}封面照片`,
      source: "github_legacy",
    },
    ...images.map((url, index) => ({
      id: galleryAssetIds[index],
      role: "gallery",
      sortOrder: index + 1,
      url: normalizeText(typeof url === "string" ? url : url?.src),
      altText: normalizeText(input.imageAlts?.[index] || (typeof url === "object" ? url?.alt : "")) || `${title}花絮與成果照片 ${index + 1}`,
      source: "github_legacy",
    })),
  ];

  return {
    schemaVersion: "1.0",
    contentType: "class_result",
    status: "approved",
    data: normalized.data,
    media,
    importStats: normalized.stats,
  };
}
