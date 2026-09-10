(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.YimiPublicUx = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_BATCH_SIZE = 12;
  const INTERNAL_DIGITAL_WALK_TEXT = /(待確認|待補|待整理|待查|待訪談|尚未查證|未查證|仍需|仍以[^，。；]*確認|需進一步|需整理|需補充|需訪談|需向|需以口述|另行確認|後續(?:田野|資料|調查|階段)?|未來若能|建議補拍|正式發布前|網站正式介紹應|目前公開(?:網路)?資料仍不足|目前照片未完整呈現|現有照片僅|如現場確認|主要來源，|可作延伸參考|編輯提示)/;
  const FORBIDDEN_PUBLIC_STOP_IMAGES = [
    /\/unsorted\//i,
    /\/DW-YG-001\/YG-01\/cover\.jpg$/i,
    /\/DW-WT-001\/WT-03\/01\.JPG$/i,
  ];

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

  function isPublicDigitalWalk(item) {
    return item?.publicationStatus === "approved" && item.publiclyListed === true;
  }

  function isDraftDigitalWalk(item) {
    return item?.publicationStatus === "draft" && item.publiclyListed === false;
  }

  function selectByDigitalWalkVisibility(items, visibility) {
    const source = Array.isArray(items) ? items : [];
    if (visibility === "public") return source.filter(isPublicDigitalWalk);
    if (visibility === "draft") return source.filter(isDraftDigitalWalk);
    return source;
  }

  function getPublicDigitalWalks(data) {
    return selectByDigitalWalkVisibility(data?.routes, "public");
  }

  function getDraftDigitalWalks(data) {
    return selectByDigitalWalkVisibility(data?.routes, "draft");
  }

  function getDigitalWalkCollection(data, identifier, visibility = "all") {
    const collections = selectByDigitalWalkVisibility(data?.collections, visibility);
    return collections.find((collection) => (
      collection?.id === identifier || collection?.slug === identifier
    )) || null;
  }

  function getDigitalWalksForCollection(data, collectionIdentifier, visibility = "all") {
    const identifier = typeof collectionIdentifier === "object"
      ? collectionIdentifier?.id || collectionIdentifier?.slug
      : collectionIdentifier;
    const collection = getDigitalWalkCollection(data, identifier, visibility);
    if (!collection || !Array.isArray(collection.routeIds)) return [];

    const routesById = new Map(
      selectByDigitalWalkVisibility(data?.routes, visibility)
        .filter((route) => route?.collectionId === collection.id)
        .map((route) => [route.id, route])
    );

    return collection.routeIds
      .map((routeId) => routesById.get(routeId))
      .filter(Boolean);
  }

  function isPublicDigitalWalkText(value) {
    const text = String(value || "").trim();
    return Boolean(text) && !INTERNAL_DIGITAL_WALK_TEXT.test(text);
  }

  function selectPublicTextList(value) {
    return (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(isPublicDigitalWalkText);
  }

  function selectPublicDescription(value) {
    return String(value || "")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(isPublicDigitalWalkText)
      .join("\n\n");
  }

  function isAllowedPublicStopImage(value) {
    const path = String(value || "").trim();
    return Boolean(path) && !FORBIDDEN_PUBLIC_STOP_IMAGES.some((pattern) => pattern.test(path));
  }

  function selectPublicDigitalWalkStop(stop) {
    if (!stop || typeof stop !== "object" || stop.publicationStatus !== "approved") return null;

    const rightsStatus = String(stop.rights?.status || "").trim();
    const allowAllMedia = ["已確認", "可使用"].includes(rightsStatus);
    const allowCoverOnly = rightsStatus === "部分可使用";
    const coverImage = (allowAllMedia || allowCoverOnly) && isAllowedPublicStopImage(stop.coverImage)
      ? stop.coverImage
      : "";
    const images = allowAllMedia
      ? uniquePaths(stop.images).filter(isAllowedPublicStopImage)
      : [];
    const pendingText = JSON.stringify(stop.pendingItems || []);
    const localName = isPublicDigitalWalkText(stop.localName) && !pendingText.includes(String(stop.localName))
      ? String(stop.localName).trim()
      : "";
    const privateLandStatus = String(stop.privateLand?.status || "").trim();
    const privateLandNote = String(stop.privateLand?.note || "").trim();
    const privateLand = ["是", "否"].includes(privateLandStatus) && isPublicDigitalWalkText(privateLandNote)
      ? { status: privateLandStatus, note: privateLandNote }
      : null;
    const coordinates = Number.isFinite(Number(stop.coordinates?.lat)) && Number.isFinite(Number(stop.coordinates?.lng))
      ? { lat: Number(stop.coordinates.lat), lng: Number(stop.coordinates.lng) }
      : null;
    const googleMapsUrl = /^https:\/\/maps\.app\.goo\.gl\//.test(String(stop.googleMapsUrl || ""))
      ? stop.googleMapsUrl
      : "";

    return {
      id: stop.id,
      routeId: stop.routeId,
      order: Number(stop.order) || 0,
      name: String(stop.name || "").trim(),
      localName,
      description: selectPublicDescription(stop.description),
      storyPoints: selectPublicTextList(stop.storyPoints),
      locationDescription: isPublicDigitalWalkText(stop.locationDescription) ? String(stop.locationDescription).trim() : "",
      landmarks: selectPublicTextList(stop.landmarks),
      observationPrompt: isPublicDigitalWalkText(stop.observationPrompt) ? String(stop.observationPrompt).trim() : "",
      safetyNotes: selectPublicTextList(stop.safetyNotes),
      privateLand,
      sources: selectPublicTextList(stop.sources),
      coverImage,
      images,
      coordinates,
      googleMapsUrl,
      recommendedMinutes: Number(stop.recommendedMinutes) || 0,
    };
  }

  return {
    DEFAULT_BATCH_SIZE,
    nextVisibleCount,
    resolvePublicCover,
    visibleBatch,
    getPublicDigitalWalks,
    getDraftDigitalWalks,
    getDigitalWalkCollection,
    getDigitalWalksForCollection,
    selectPublicDigitalWalkStop,
  };
});
