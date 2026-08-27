import { formatActivityDateLabel } from "./normalize-common.mjs";

export function safePublicHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function projectClassResultPublicData(data) {
  return {
    id: data.id,
    year: data.year,
    title: data.title,
    className: data.className,
    instructor: data.instructor,
    description: data.description,
    districts: [...data.districts],
    venue: data.venue,
    tags: [...data.tags],
    sdgs: [...data.sdgs],
    displayOrder: data.displayOrder,
    publicNotes: data.publicNotes,
    coverAssetId: data.coverAssetId,
    galleryAssetIds: [...data.galleryAssetIds],
  };
}

export function projectActivityPublicData(data) {
  return {
    id: data.id,
    year: data.year,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    dateLabel: data.startDate
      ? formatActivityDateLabel(data.startDate, data.endDate)
      : data.dateLabel,
    districts: [...data.districts],
    venue: data.venue,
    projectName: data.projectName,
    activityType: data.activityType,
    topic: data.topic,
    sdgs: [...data.sdgs],
    summary: data.summary,
    participants: data.participants,
    partnerOrganizations: data.partnerOrganizations,
    leader: data.leader,
    keywords: [...data.keywords],
    videoUrl: safePublicHttpsUrl(data.videoUrl),
    relatedUrl: safePublicHttpsUrl(data.relatedUrl),
    featured: data.featured,
    publicNotes: data.publicNotes,
    coverAssetId: data.coverAssetId,
    galleryAssetIds: [...data.galleryAssetIds],
  };
}
