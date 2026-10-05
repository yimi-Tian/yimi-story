export const WALKING_TYPES = Object.freeze([
  "地方走讀",
  "聚落踏查",
  "流域觀察",
  "生態觀察",
  "訪談／口述",
  "文史採集",
  "產業地景",
  "其他",
]);

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value) {
  return trimmed(value) || null;
}

export function normalizeWalkingRecord(value) {
  if (value === null || value === undefined) return null;

  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const stops = Array.isArray(source.stops)
    ? source.stops
      .map((stop) => {
        const row = stop && typeof stop === "object" && !Array.isArray(stop) ? stop : {};
        return { name: trimmed(row.name), note: nullableText(row.note) };
      })
      .filter((stop) => stop.name || stop.note)
    : [];
  const fieldNotes = Array.isArray(source.fieldNotes)
    ? source.fieldNotes.map(trimmed).filter(Boolean)
    : [];

  return {
    type: trimmed(source.type),
    titleOverride: nullableText(source.titleOverride),
    summary: trimmed(source.summary),
    routeSummary: nullableText(source.routeSummary),
    stops,
    fieldNotes,
    digitalWalkId: nullableText(source.digitalWalkId),
    coverAssetId: nullableText(source.coverAssetId),
  };
}

export function effectiveWalkingTitle(activity) {
  return trimmed(activity?.walkingRecord?.titleOverride) || trimmed(activity?.name);
}
