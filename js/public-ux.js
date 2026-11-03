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
    /\/DW-YG-001\/YG-07\/02\.jpg$/i,
    /\/DW-WT-001\/WT-03\/01\.JPG$/i,
  ];

  function uniquePaths(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  }

  // 圖片顯示版對照：map 形如 { "<原圖路徑小寫>": { d: "顯示版 WebP", o: "原圖實際路徑" } }。
  // 在「產生 <img src> 之前」就把路徑換成顯示版，所以瀏覽器不會先下載原圖或先發出 404 請求。
  // 找不到對照時原樣回傳（行為與舊版完全相同）。
  function getDisplayMap(map) {
    if (map) return map;
    return (typeof globalThis !== "undefined" && globalThis.YIMI_IMAGE_DISPLAY_MAP) || null;
  }

  function displayKey(path) {
    return String(path || "").replace(/^\.?\//, "").split(/[?#]/)[0].toLowerCase();
  }

  function lookupDisplay(path, map) {
    const source = getDisplayMap(map);
    if (!source || typeof path !== "string" || !path) return null;
    const key = displayKey(path);
    const entry = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : null;
    return entry && entry.d ? entry : null;
  }

  function resolveDisplayImage(path, map) {
    const entry = lookupDisplay(path, map);
    return entry ? entry.d : path;
  }

  // 同一張圖（原圖路徑、大小寫不同的原圖路徑、顯示版）回傳相同的識別值，供去重與比對使用。
  function imageIdentity(path, map) {
    const entry = lookupDisplay(path, map);
    return entry ? entry.d : path;
  }

  function sameImage(a, b, map) {
    return imageIdentity(a, map) === imageIdentity(b, map);
  }

  // 展開成「顯示版在前、原圖實際路徑在後」的候選清單（顯示版載入失敗時才退回原圖）。
  function expandDisplayCandidates(paths, map) {
    const out = [];
    for (const path of paths) {
      const entry = lookupDisplay(path, map);
      if (entry) {
        out.push(entry.d);
        if (entry.o) out.push(entry.o);
      } else {
        out.push(path);
      }
    }
    return out;
  }

  function resolvePublicCover({
    explicitCover = "",
    gallery = [],
    legacyFallbacks = [],
    placeholder = "public/images/placeholder.svg",
    preferLegacyFallback = false,
    displayMap = null,
  } = {}) {
    const galleryPaths = uniquePaths(gallery);
    const legacyPaths = uniquePaths(legacyFallbacks);
    const ordered = preferLegacyFallback
      ? [explicitCover, ...legacyPaths, ...galleryPaths]
      : [explicitCover, ...galleryPaths, ...legacyPaths];
    const candidates = uniquePaths([...expandDisplayCandidates(ordered.filter(Boolean), displayMap), placeholder]);
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

  function getPublicWalkingRecords(data) {
    return (Array.isArray(data) ? data : [])
      .filter((record) => record?.publicationStatus === "approved" && record.publiclyListed === true)
      .slice()
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0)
        || String(a.id || "").localeCompare(String(b.id || ""), "en", { numeric: true }));
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
    const publicRoutes = selectByDigitalWalkVisibility(data?.routes, "public");
    const routesById = new Map(publicRoutes.map((route) => [route.id, route]));
    const orderedRoutes = [];
    const includedRouteIds = new Set();
    for (const collection of selectByDigitalWalkVisibility(data?.collections, "public")) {
      for (const routeId of Array.isArray(collection.routeIds) ? collection.routeIds : []) {
        const route = routesById.get(routeId);
        if (!route || includedRouteIds.has(routeId)) continue;
        orderedRoutes.push(route);
        includedRouteIds.add(routeId);
      }
    }
    return orderedRoutes.concat(publicRoutes.filter((route) => !includedRouteIds.has(route.id)));
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
    const rawCoordinates = Number.isFinite(Number(stop.coordinates?.lat)) && Number.isFinite(Number(stop.coordinates?.lng))
      ? { lat: Number(stop.coordinates.lat), lng: Number(stop.coordinates.lng) }
      : null;
    const googleMapsUrl = /^https:\/\/maps\.app\.goo\.gl\//.test(String(stop.googleMapsUrl || ""))
      ? stop.googleMapsUrl
      : "";
    const googleMapsNote = googleMapsUrl && isPublicDigitalWalkText(stop.googleMapsNote)
      ? String(stop.googleMapsNote).trim()
      : "";
    const googleMapsButtonText = googleMapsUrl && isPublicDigitalWalkText(stop.googleMapsButtonText)
      ? String(stop.googleMapsButtonText).trim()
      : "";
    const usesNearbyNavigation = /鄰近定位|附近/.test(`${googleMapsNote} ${googleMapsButtonText}`);
    const coordinates = usesNearbyNavigation ? null : rawCoordinates;

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
      googleMapsNote,
      googleMapsButtonText,
      recommendedMinutes: Number(stop.recommendedMinutes) || 0,
    };
  }

  return {
    DEFAULT_BATCH_SIZE,
    nextVisibleCount,
    resolvePublicCover,
    resolveDisplayImage,
    expandDisplayCandidates,
    imageIdentity,
    sameImage,
    visibleBatch,
    getPublicWalkingRecords,
    getPublicDigitalWalks,
    getDraftDigitalWalks,
    getDigitalWalkCollection,
    getDigitalWalksForCollection,
    selectPublicDigitalWalkStop,
  };
});
