(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YimiPublicUx = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_BATCH_SIZE = 12;

  function uniquePaths(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  }

  function resolvePublicCover({
    explicitCover = "",
    gallery = [],
    legacyFallbacks = [],
    placeholder = "public/images/placeholder.svg",
    preferLegacyFallback = false,
  } = {}) {
    const galleryPaths = uniquePaths(gallery);
    const legacyPaths = uniquePaths(legacyFallbacks);
    const ordered = preferLegacyFallback
      ? [explicitCover, ...legacyPaths, ...galleryPaths, placeholder]
      : [explicitCover, ...galleryPaths, ...legacyPaths, placeholder];
    const candidates = uniquePaths(ordered);
    const src = candidates[0] || placeholder;
    return { src, fallbacks: candidates.filter((candidate) => candidate !== src) };
  }

  function visibleBatch(items, visibleCount = DEFAULT_BATCH_SIZE) {
    const source = Array.isArray(items) ? items : [];
    const safeCount = Math.max(0, Number(visibleCount) || DEFAULT_BATCH_SIZE);
    return source.slice(0, safeCount);
  }

  function nextVisibleCount(current, total, increment = DEFAULT_BATCH_SIZE) {
    return Math.min(Math.max(0, Number(total) || 0), Math.max(0, Number(current) || 0) + increment);
  }

  return { DEFAULT_BATCH_SIZE, nextVisibleCount, resolvePublicCover, visibleBatch };
});
