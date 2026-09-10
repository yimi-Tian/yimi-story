import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { parseCsv } from "../../tools/content/csv.mjs";

const require = createRequire(import.meta.url);
const {
  DEFAULT_BATCH_SIZE,
  nextVisibleCount,
  resolvePublicCover,
  visibleBatch,
  getPublicDigitalWalks,
  getDraftDigitalWalks,
  getDigitalWalkCollection,
  getDigitalWalksForCollection,
  selectPublicDigitalWalkStop,
} = require("../../js/public-ux.js");
const root = new URL("../../", import.meta.url);
const source = await readFile(new URL("script.js", root), "utf8");
const platformSource = await readFile(new URL("js/platform-home.js", root), "utf8");
const styles = await readFile(new URL("styles.css", root), "utf8");
const platformStyles = await readFile(new URL("css/platform-home.css", root), "utf8");
const index = await readFile(new URL("index.html", root), "utf8");
const platform = await readFile(new URL("platform.html", root), "utf8");
const showcase = JSON.parse(await readFile(new URL("data/showcase.json", root), "utf8"));
const digitalWalks = JSON.parse(await readFile(new URL("data/digital-walks.json", root), "utf8"));
const activities = parseCsv(await readFile(new URL("activities.csv", root), "utf8"));
const collectionPreviewSource = source.slice(
  source.indexOf("function renderDigitalWalkCollectionPreview"),
  source.indexOf("function renderDigitalWalkPublicCollection"),
);
const publicCollectionSource = source.slice(
  source.indexOf("function renderDigitalWalkPublicCollection"),
  source.indexOf("function renderDigitalWalkReleaseCandidate"),
);
const chilanKnowledgeSource = source.slice(
  source.indexOf("function getChilanKnowledgeTopics"),
  source.indexOf("function renderDigitalWalkCollectionPreview"),
);
const publicStopRendererSource = source.slice(
  source.indexOf("function renderDigitalWalkPublicStopDetail"),
  source.indexOf("function renderDigitalWalkStopDetail"),
);
const releaseCandidateSource = source.slice(
  source.indexOf("function renderDigitalWalkReleaseCandidate"),
  source.indexOf("function renderDigitalWalkDraftList"),
);
const publicRouteRendererSource = source.slice(
  source.indexOf("function renderDigitalWalkPublicRouteDetail"),
  source.indexOf("function digitalWalkPublicStopCard"),
);
const draftStopRendererSource = source.slice(
  source.indexOf("function renderDigitalWalkStopDetail"),
  source.indexOf("function getDigitalWalkDisplayGallery"),
);
const draftDataNotesSource = source.slice(
  source.indexOf("function digitalWalkDataNotesSection"),
  source.indexOf("function formatDigitalWalkPendingItem"),
);
const digitalWalkStops = digitalWalks.routes.flatMap((route) => route.stops || []);
const digitalWalkStop = (id) => digitalWalkStops.find((stop) => stop.id === id);
const selectApprovedStopFixture = (stop) => {
  const fixture = structuredClone(stop);
  fixture.publicationStatus = "approved";
  return selectPublicDigitalWalkStop(fixture);
};
const selectReleaseCandidateStop = (stop) => selectPublicDigitalWalkStop({
  ...structuredClone(stop),
  publicationStatus: "approved",
});

test("共用封面 resolver 依 explicit、gallery、legacy、placeholder 決定順序", () => {
  const explicit = resolvePublicCover({ explicitCover: "cover.jpg", gallery: ["01.jpg"], legacyFallbacks: ["legacy.jpg"], placeholder: "empty.svg" });
  assert.deepEqual(explicit, { src: "cover.jpg", fallbacks: ["01.jpg", "legacy.jpg", "empty.svg"] });
  assert.equal(resolvePublicCover({ gallery: ["01.jpg"], legacyFallbacks: ["legacy.jpg"] }).src, "01.jpg");
  assert.equal(resolvePublicCover({ legacyFallbacks: ["legacy.jpg"] }).src, "legacy.jpg");
  assert.equal(resolvePublicCover().src, "public/images/placeholder.svg");
});

test("115-002 的 cms-public 明確封面在列表與 detail 共用同一優先結果", () => {
  const row = activities.find((item) => item["活動ID"] === "115-002");
  assert.ok(row);
  const gallery = row["成果照片路徑"].split(",").filter(Boolean);
  const cover = resolvePublicCover({ explicitCover: row["封面照片路徑"], gallery, legacyFallbacks: ["public/images/activities/115-002/cover.jpg"] });
  assert.match(cover.src, /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/cms-public\//);
  assert.notEqual(cover.src, gallery[0]);
  assert.match(source, /activityMiniCard[\s\S]*activity\.cover/);
  assert.match(source, /renderActivityDetail[\s\S]*activity\.cover/);
});

test("活動公開頁的參與欄位統一顯示參與人次", () => {
  assert.match(source, /detailInfo\("參與人次", activity\.participants/);
  assert.match(source, /總參與人次/);
  assert.doesNotMatch(source, /detailInfo\("參與人數"|detailInfo\("參加人數"/);
});

test("112-015 保留既有 conventional cover.jpg 顯示相容且不改 canonical", () => {
  const row = activities.find((item) => item["活動ID"] === "112-015");
  assert.ok(row);
  assert.equal(row["封面照片路徑"], "");
  const gallery = row["成果照片路徑"].split(",").filter(Boolean);
  const cover = resolvePublicCover({
    explicitCover: "",
    gallery,
    legacyFallbacks: ["public/images/activities/112-015/cover.jpg"],
    preferLegacyFallback: true,
  });
  assert.equal(cover.src, "public/images/activities/112-015/cover.jpg");
  assert.equal(row["封面照片路徑"], "");
});

test("長列表固定 12 筆一批且不重複", () => {
  const items = Array.from({ length: 30 }, (_, index) => index + 1);
  assert.equal(DEFAULT_BATCH_SIZE, 12);
  assert.deepEqual(visibleBatch(items, 12), items.slice(0, 12));
  assert.deepEqual(visibleBatch(items, nextVisibleCount(12, items.length)), items.slice(0, 24));
  assert.equal(new Set(visibleBatch(items, 24)).size, 24);
  assert.equal(nextVisibleCount(24, items.length), 30);
});

test("導覽顯示新資訊架構、移除活動照片入口並保留舊 route redirect", () => {
  for (const html of [index, platform]) {
    assert.match(html, />成果故事</);
    assert.match(html, />學習成果</);
    assert.doesNotMatch(html, />成果故事館</);
    assert.doesNotMatch(html, />成果展示</);
  }
  assert.doesNotMatch(index, /#\/showcase\/activity-photos/);
  assert.doesNotMatch(index, /查看照片成果/);
  assert.equal(showcase.categories.some((item) => item.id === "activity-photos"), false);
  assert.match(source, /\["activity-photos", "photos"\]\.includes\(route\.detail\)[\s\S]*location\.replace\("#\/overview"\)/);
});

test("地方探索公開選單只顯示赤蘭溪 AR 與已發布數位走讀", () => {
  assert.match(index, /data-nav="themes">主題館[\s\S]*?#\/themes\/food-agriculture[\s\S]*?#\/themes\/marine-education[\s\S]*?#\/themes\/local-culture[\s\S]*?#\/themes\/environmental-education/);
  assert.match(index, /data-nav="explore">地方探索[\s\S]*?<div class="nav-menu">\s*<a href="#\/digital\/game">赤蘭溪 AR走讀<\/a>\s*<a href="#\/digital\/chilan-walk">赤蘭溪數位走讀<\/a>\s*<\/div>/);
  assert.doesNotMatch(index, /赤蘭溪探索模組|朴子醫療文化探索|海線生活探索|食農地方探索/);
  assert.doesNotMatch(index, /#\/digital\/(?:DW-WT-001|DW-YG-001|puzi-medical)/);
  assert.match(source, /slug: "chilan-walk"/);
  assert.match(source, /slug: "puzi-medical"/);
  assert.match(source, /detail === "game"[\s\S]*renderChilanGame/);
});

test("赤蘭溪 collection 以固定 slug 與有序 routeIds 建立 canonical 關係", () => {
  const collection = getDigitalWalkCollection(digitalWalks, "chilan-walk");
  assert.ok(collection);
  assert.equal(collection.id, "DWC-CHILAN-001");
  assert.equal(collection.title, "赤蘭溪數位走讀");
  assert.deepEqual(collection.routeIds, ["DW-WT-001", "DW-YG-001"]);
  assert.equal(collection.publicationStatus, "approved");
  assert.equal(collection.publiclyListed, true);
  assert.equal(getDigitalWalkCollection(digitalWalks, "chilan-walk", "public")?.id, collection.id);
  assert.equal(getDigitalWalkCollection(digitalWalks, "chilan-walk", "draft"), null);
});

test("兩條赤蘭溪路線以 collectionId 關聯，不依標題或地區文字推測", () => {
  const routes = getDigitalWalksForCollection(digitalWalks, "chilan-walk");
  assert.deepEqual(routes.map((route) => route.id), ["DW-WT-001", "DW-YG-001"]);
  assert.ok(routes.every((route) => route.collectionId === "DWC-CHILAN-001"));

  const renamed = structuredClone(digitalWalks);
  renamed.routes.forEach((route) => {
    route.title = `改名-${route.id}`;
    route.district = "測試地區";
  });
  assert.deepEqual(
    getDigitalWalksForCollection(renamed, "DWC-CHILAN-001").map((route) => route.id),
    ["DW-WT-001", "DW-YG-001"],
  );
});

test("public 與 draft selectors 嚴格採用狀態及列表旗標的雙條件", () => {
  assert.deepEqual(getPublicDigitalWalks(digitalWalks).map((route) => route.id), ["DW-WT-001"]);
  assert.deepEqual(getDraftDigitalWalks(digitalWalks).map((route) => route.id), ["DW-YG-001"]);

  const fixture = {
    routes: [
      { id: "approved-listed", publicationStatus: "approved", publiclyListed: true },
      { id: "approved-hidden", publicationStatus: "approved", publiclyListed: false },
      { id: "draft-hidden", publicationStatus: "draft", publiclyListed: false },
      { id: "draft-listed", publicationStatus: "draft", publiclyListed: true },
    ],
  };
  assert.deepEqual(getPublicDigitalWalks(fixture).map((route) => route.id), ["approved-listed"]);
  assert.deepEqual(getDraftDigitalWalks(fixture).map((route) => route.id), ["draft-hidden"]);
});

test("draft preview renderer 仍由 draft selector 提供既有路線", () => {
  assert.match(source, /getDraftDigitalWalks\(\)\.find\(\(route\) => route\.id === detail\)/);
  assert.match(source, /href="#\/digital\/\$\{encodeURIComponent\(route\.id\)\}"/);
  assert.match(source, /href="#\/digital\/\$\{encodeURIComponent\(route\.id\)\}\/\$\{encodeURIComponent\(stop\.id\)\}"/);
  assert.match(source, /線上數位走讀草稿預覽/);
});

test("赤蘭溪 canonical route 讀取公開 collection 並加入 dropdown", () => {
  assert.match(source, /getDigitalWalkCollection\(detail, "public"\)[\s\S]*renderDigitalWalkPublicCollection\(publicCollection\)/);
  assert.match(index, /href="#\/digital\/chilan-walk">赤蘭溪數位走讀<\/a>/);
});

test("draft collection preview 使用現有三段 router 且在 promotion 後仍可內部檢查完整關聯", () => {
  assert.match(source, /detail === "draft-collection"[\s\S]*renderDigitalWalkCollectionPreview\(stopId\)/);
  assert.match(source, /route\.detail === "draft-collection"[\s\S]*getDigitalWalkCollection\(route\.id\)/);
  assert.match(source, /href="#\/digital\/draft-collection\/\$\{encodeURIComponent\(chilanCollection\.slug\)\}"/);
  assert.match(collectionPreviewSource, /getDigitalWalkCollection\(collectionSlug\)/);
  assert.doesNotMatch(index, /#\/digital\/draft-collection/);
});

test("collection preview 依 routeIds 動態輸出 WT、YG 與實際站數", () => {
  const collection = getDigitalWalkCollection(digitalWalks, "chilan-walk");
  const routes = getDigitalWalksForCollection(digitalWalks, collection.id);
  assert.deepEqual(routes.map((route) => route.id), ["DW-WT-001", "DW-YG-001"]);
  assert.deepEqual(routes.map((route) => Number(route.stopCount)), [5, 7]);
  assert.deepEqual(routes.map((route) => route.publicationStatus), ["approved", "draft"]);
  assert.match(collectionPreviewSource, /getDigitalWalksForCollection\(collection\.id\)/);
  assert.match(collectionPreviewSource, /routes\.map\(digitalWalkCollectionRouteCard\)/);
  assert.match(collectionPreviewSource, /route\.stopCount/);
  assert.match(collectionPreviewSource, /encodeURIComponent\(route\.id\)/);
  assert.doesNotMatch(collectionPreviewSource, /DW-WT-001|DW-YG-001|灣潭聚落線上數位走讀|鹽館聚落線上數位走讀/);
});

test("collection preview 移除 ABOUT 段落並依路線、背景、AR 排序", () => {
  assert.doesNotMatch(collectionPreviewSource, /ABOUT THE COLLECTION|digital-walk-collection-position|digital-walk-position-title/);
  const routesIndex = collectionPreviewSource.indexOf("digital-walk-collection-routes");
  const knowledgeIndex = collectionPreviewSource.indexOf("digital-walk-knowledge-section");
  const arIndex = collectionPreviewSource.indexOf("digital-walk-collection-ar");
  assert.ok(routesIndex > 0);
  assert.ok(knowledgeIndex > routesIndex);
  assert.ok(arIndex > knowledgeIndex);
});

test("collection preview 唯讀使用 RL 公開摘要且排除內部整理欄位", () => {
  assert.match(chilanKnowledgeSource, /window\.LOCAL_EXPLORATION_DATA/);
  assert.match(chilanKnowledgeSource, /chilanModule\?\.guidePoints/);
  assert.match(chilanKnowledgeSource, /title: point\.title/);
  assert.match(chilanKnowledgeSource, /description: point\.description/);
  assert.doesNotMatch(`${chilanKnowledgeSource}${collectionPreviewSource}`, /pendingItems|photoDirections|guidePointStatus|資料整理中|建置中/);
});

test("collection Hero 不使用圖片，AR CTA 導向既有公開入口", () => {
  const heroSource = collectionPreviewSource.slice(
    collectionPreviewSource.indexOf("digital-walk-collection-hero"),
    collectionPreviewSource.indexOf("digitalWalkDraftNotice"),
  );
  assert.match(heroSource, /\$\{collection\.title\}/);
  assert.match(heroSource, /\$\{collection\.summary\}/);
  assert.doesNotMatch(heroSource, /<img|112-009|coverImage|unsorted|YG-01\/cover\.jpg|WT-03\/01\.JPG/);
  assert.match(collectionPreviewSource, /href="#\/digital\/game"/);
});

test("collection preview 延續兩欄桌機與 719px 以下單欄觸控樣式", () => {
  assert.match(styles, /@media \(min-width: 720px\)[\s\S]*?\.digital-walk-collection-route-grid\s*\{[\s\S]*?repeat\(2/);
  assert.match(styles, /@media \(max-width: 719px\)[\s\S]*?\.digital-walk-collection-route-card \.button[\s\S]*?min-height: 46px/);
  assert.match(styles, /\.digital-walk-knowledge-grid[\s\S]*?display: grid/);
});

test("draft renderer 保留 pendingItems、權利註記與草稿提示", () => {
  assert.match(draftStopRendererSource, /digitalWalkDraftNotice\(\)/);
  assert.match(draftStopRendererSource, /digitalWalkDataNotesSection\(stop\)/);
  assert.match(draftDataNotesSource, /stop\.pendingItems/);
  assert.match(draftDataNotesSource, /stop\.rights/);
  assert.match(draftDataNotesSource, /資料補充中/);
});

test("public selector 與 renderer 不輸出 pending、rights 或內部待辦字樣", () => {
  const wantanStops = digitalWalks.routes.find((route) => route.id === "DW-WT-001").stops;
  const yanguanStops = digitalWalks.routes.find((route) => route.id === "DW-YG-001").stops;
  assert.ok(wantanStops.every((stop) => selectPublicDigitalWalkStop(stop)));
  assert.ok(yanguanStops.every((stop) => selectPublicDigitalWalkStop(stop) === null));
  const selectedStops = digitalWalkStops.map(selectApprovedStopFixture);
  assert.equal(selectedStops.length, 12);
  for (const stop of selectedStops) {
    assert.ok(stop);
    assert.equal(Object.hasOwn(stop, "pendingItems"), false);
    assert.equal(Object.hasOwn(stop, "rights"), false);
    assert.doesNotMatch(JSON.stringify(stop), /待確認|待補|待整理|待查|編輯提示/);
  }
  assert.doesNotMatch(publicStopRendererSource, /pendingItems|\.rights|digitalWalkDraftNotice|資料補充中|公開授權說明/);
  assert.doesNotMatch(publicStopRendererSource, /待確認|待補|待整理|待查/);
  assert.doesNotMatch(
    JSON.stringify(selectApprovedStopFixture(digitalWalkStop("YG-02"))),
    /目前照片未完整呈現/,
  );
});

test("YG-01 public mode 採無圖片版型且拒絕禁止公開街景圖", () => {
  const selected = selectApprovedStopFixture(digitalWalkStop("YG-01"));
  assert.equal(selected.coverImage, "");
  assert.deepEqual(selected.images, []);
  assert.match(publicStopRendererSource, /digital-walk-stop-layout\$\{stop\.coverImage \? "" : " is-no-image"\}/);
  assert.match(styles, /\.digital-walk-stop-layout\.is-no-image\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);

  const forbiddenFixture = structuredClone(digitalWalkStop("YG-01"));
  forbiddenFixture.publicationStatus = "approved";
  forbiddenFixture.rights.status = "已確認";
  forbiddenFixture.coverImage = "public/images/digital/digital-walks/DW-YG-001/YG-01/cover.jpg";
  assert.equal(selectPublicDigitalWalkStop(forbiddenFixture).coverImage, "");
});

test("WT-03 不使用疑似錯站圖片，無圖仍保留完整文字站點", () => {
  const raw = digitalWalkStop("WT-03");
  const selected = selectApprovedStopFixture(raw);
  assert.deepEqual(raw.images, []);
  assert.equal(selected.coverImage, "");
  assert.deepEqual(selected.images, []);
  assert.ok(selected.name && selected.locationDescription && selected.storyPoints.length);

  const forbiddenFixture = structuredClone(raw);
  forbiddenFixture.publicationStatus = "approved";
  forbiddenFixture.rights.status = "已確認";
  forbiddenFixture.images = ["public/images/digital/digital-walks/DW-WT-001/WT-03/01.JPG"];
  assert.deepEqual(selectPublicDigitalWalkStop(forbiddenFixture).images, []);
});

test("public mode 保留安全與私人土地提醒，且先提醒再提供導航", () => {
  const selected = selectApprovedStopFixture(digitalWalkStop("YG-07"));
  assert.ok(selected.safetyNotes.length);
  assert.deepEqual(selected.privateLand, {
    status: "是",
    note: "戶外為公共空間，無法進入內部拍攝。",
  });
  assert.match(selected.googleMapsUrl, /^https:\/\/maps\.app\.goo\.gl\//);
  const safetyIndex = source.indexOf("<h3>安全提醒</h3>", source.indexOf("function digitalWalkReminderSection"));
  const privateLandIndex = source.indexOf("<h3>私人土地或進入提醒</h3>", safetyIndex);
  const mapIndex = source.indexOf("<h3>位置導航</h3>", privateLandIndex);
  assert.ok(safetyIndex < privateLandIndex && privateLandIndex < mapIndex);
});

test("public sources 僅保留可對外來源，rights 只控制媒體而不直接顯示", () => {
  const wt04 = selectApprovedStopFixture(digitalWalkStop("WT-04"));
  const yg03 = selectApprovedStopFixture(digitalWalkStop("YG-03"));
  assert.equal(wt04.sources.length, 4);
  assert.deepEqual(yg03.sources, ["現場匾額、楹聯與建築文字"]);
  assert.equal(Object.hasOwn(wt04, "rights"), false);
  assert.match(publicStopRendererSource, /digitalWalkPublicSourcesSection\(stop\.sources\)/);
});

test("正式 public renderer 只接受 approved + listed 的灣潭路線", () => {
  assert.match(source, /getPublicDigitalWalks\(\)\.find\(\(route\) => route\.id === detail\)/);
  assert.deepEqual(getPublicDigitalWalks(digitalWalks).map((route) => route.id), ["DW-WT-001"]);
  assert.deepEqual(getDraftDigitalWalks(digitalWalks).map((route) => route.id), ["DW-YG-001"]);
  assert.match(publicCollectionSource, /getDigitalWalksForCollection\(collection\.id, "public"\)/);
  assert.match(publicCollectionSource, /href="#\/digital\/\$\{encodeURIComponent\(route\.id\)\}">進入數位走讀/);
});

test("正式赤蘭溪 collection 只輸出灣潭且不含內部預覽標示", () => {
  const routes = getDigitalWalksForCollection(digitalWalks, "chilan-walk", "public");
  assert.deepEqual(routes.map((route) => route.id), ["DW-WT-001"]);
  assert.doesNotMatch(routes[0].summary, /鹽館/);
  assert.match(publicCollectionSource, /const publicSummary = routes\.length === 1/);
  assert.doesNotMatch(
    publicCollectionSource,
    /發布候選|草稿|pendingItems|\.rights|publicationStatus|publiclyListed|待確認|待補|待整理/,
  );
});

test("Stage 5A RC route 使用獨立 namespace 且不占用 canonical route", () => {
  assert.match(source, /detail === "release-candidate"[\s\S]*renderDigitalWalkReleaseCandidate\(stopId, childId\)/);
  assert.match(releaseCandidateSource, /#\/digital\/release-candidate\/chilan-walk/);
  assert.match(releaseCandidateSource, /#\/digital\/release-candidate\/\$\{encodeURIComponent\(route\.id\)\}/);
  assert.doesNotMatch(index, /#\/digital\/release-candidate/);
  assert.match(index, /href="#\/digital\/chilan-walk"/);
});

test("RC collection 明確只取灣潭路線且保留原 collection 雙路線關聯", () => {
  const collection = getDigitalWalkCollection(digitalWalks, "chilan-walk");
  const route = digitalWalks.routes.find((item) => item.id === "DW-WT-001");
  assert.deepEqual(collection.routeIds, ["DW-WT-001", "DW-YG-001"]);
  assert.match(releaseCandidateSource, /getDigitalWalksForCollection\(collection\.id\)\.find\(\(item\) => item\.id === "DW-WT-001"\)/);
  assert.doesNotMatch(releaseCandidateSource, /DW-YG-001|鹽館聚落線上數位走讀/);
  assert.match(releaseCandidateSource, /const routes = route \? \[route\] : \[\]/);
  assert.match(releaseCandidateSource, /const releaseCandidateSummary = route\?\.summary \|\| collection\.summary/);
  assert.doesNotMatch(route.summary, /鹽館/);
});

test("RC 灣潭五站全部經 public sanitizer 且不輸出內部欄位", () => {
  const route = digitalWalks.routes.find((item) => item.id === "DW-WT-001");
  const selected = route.stops.map(selectReleaseCandidateStop);
  assert.deepEqual(selected.map((stop) => stop.id), ["WT-01", "WT-02", "WT-03", "WT-04", "WT-05"]);
  assert.match(source, /getPublicDigitalWalkStops\(route, \{ allowDraftPreview: true \}\)/);
  assert.match(source, /options\.allowDraftPreview \? \{ \.\.\.stop, publicationStatus: "approved" \} : stop/);
  for (const stop of selected) {
    assert.equal(Object.hasOwn(stop, "pendingItems"), false);
    assert.equal(Object.hasOwn(stop, "rights"), false);
    assert.equal(Object.hasOwn(stop, "publicationStatus"), false);
    assert.doesNotMatch(JSON.stringify(stop), /待確認|待補|待整理|待查|內部編輯/);
  }
});

test("RC 圖片遵循 public 規則且 WT-03 強制無圖片", () => {
  const selected = Object.fromEntries(
    digitalWalks.routes
      .find((item) => item.id === "DW-WT-001")
      .stops
      .map((stop) => [stop.id, selectReleaseCandidateStop(stop)]),
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(selected).map(([id, stop]) => [id, {
      cover: stop.coverImage,
      images: stop.images,
    }])),
    {
      "WT-01": { cover: "public/images/digital/digital-walks/DW-WT-001/WT-01/cover.jpg", images: [] },
      "WT-02": { cover: "public/images/digital/digital-walks/DW-WT-001/WT-02/cover.jpg", images: [] },
      "WT-03": { cover: "", images: [] },
      "WT-04": {
        cover: "public/images/digital/digital-walks/DW-WT-001/WT-04/cover.JPG",
        images: [
          "public/images/digital/digital-walks/DW-WT-001/WT-04/01.JPG",
          "public/images/digital/digital-walks/DW-WT-001/WT-04/02.JPG",
        ],
      },
      "WT-05": {
        cover: "public/images/digital/digital-walks/DW-WT-001/WT-05/cover.jpg",
        images: [
          "public/images/digital/digital-walks/DW-WT-001/WT-05/01.JPG",
          "public/images/digital/digital-walks/DW-WT-001/WT-05/02.JPG",
        ],
      },
    },
  );
  assert.doesNotMatch(JSON.stringify(selected), /WT-03\/01\.JPG|unsorted|local-exploration/);
});

test("RC 保留安全提醒與 Maps，但不把待確認 privateLand 當成結論", () => {
  const route = digitalWalks.routes.find((item) => item.id === "DW-WT-001");
  const selected = route.stops.map(selectReleaseCandidateStop);
  assert.ok(selected.every((stop) => stop.safetyNotes.length > 0));
  assert.ok(selected.every((stop) => /^https:\/\/maps\.app\.goo\.gl\//.test(stop.googleMapsUrl)));
  assert.equal(selected.find((stop) => stop.id === "WT-03").privateLand, null);
  assert.equal(selected.find((stop) => stop.id === "WT-04").privateLand, null);
  assert.equal(selected.find((stop) => stop.id === "WT-05").privateLand, null);
});

test("RC route 與五站導覽全程維持 release-candidate namespace", () => {
  assert.match(publicRouteRendererSource, /digitalWalkPublicStopCard\(route, stop, routeHrefBase\)/);
  assert.match(publicStopRendererSource, /const routeHref = `\$\{routeHrefBase\}\/\$\{encodeURIComponent\(route\.id\)\}`/);
  assert.match(publicStopRendererSource, /href="\$\{routeHref\}\/\$\{encodeURIComponent\(previousStop\.id\)\}">← 上一站/);
  assert.match(publicStopRendererSource, /href="\$\{routeHref\}\/\$\{encodeURIComponent\(nextStop\.id\)\}">下一站/);
  assert.match(releaseCandidateSource, /routeHrefBase: "#\/digital\/release-candidate"/);
});

test("灣潭 RC 無 route map 時自然省略地圖區塊", () => {
  const route = digitalWalks.routes.find((item) => item.id === "DW-WT-001");
  assert.equal(route.routeMapImage, null);
  assert.match(source, /function digitalWalkRouteMap\(route\) \{[\s\S]*if \(!route\.routeMapImage\) return ""/);
  assert.match(publicRouteRendererSource, /digitalWalkRouteMap\(route\)/);
});

test("原 draft collection 與鹽館 draft preview 不受 RC 影響", () => {
  assert.match(collectionPreviewSource, /getDigitalWalksForCollection\(collection\.id\)/);
  assert.deepEqual(
    getDigitalWalksForCollection(digitalWalks, "chilan-walk").map((route) => route.id),
    ["DW-WT-001", "DW-YG-001"],
  );
  assert.match(source, /getDraftDigitalWalks\(\)\.find\(\(route\) => route\.id === detail\)/);
  assert.ok(getDraftDigitalWalks(digitalWalks).some((route) => route.id === "DW-YG-001"));
});

test("RC 單路線與既有手機樣式維持無水平溢位基礎", () => {
  assert.match(styles, /\.digital-walk-collection-route-grid\.is-single-route\s*\{[\s\S]*max-width:\s*780px[\s\S]*margin-inline:\s*auto/);
  assert.match(styles, /@media \(min-width: 720px\)[\s\S]*\.digital-walk-collection-route-grid\.is-single-route\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 719px\)[\s\S]*\.digital-walk-collection-route-card \.button[\s\S]*min-height: 46px/);
  assert.match(styles, /\.digital-walk-stop-card\s*\{[\s\S]*min-width:\s*0/);
});

test("Stage 5B-1 以人工確認的 WT-03 公共道路觀看文字通過發布 gate", () => {
  const collection = digitalWalks.collections.find((item) => item.id === "DWC-CHILAN-001");
  const wantan = digitalWalks.routes.find((item) => item.id === "DW-WT-001");
  const wt03 = wantan.stops.find((stop) => stop.id === "WT-03");
  const yanguan = digitalWalks.routes.find((item) => item.id === "DW-YG-001");

  assert.deepEqual(wt03.privateLand, {
    status: "待確認",
    note: "位於走讀路線可見範圍。",
  });
  assert.match(wt03.safetyNotes.join(" "), /公共道路沿線觀看/);
  assert.match(wt03.safetyNotes.join(" "), /不需進入私人土地/);
  assert.match(wt03.safetyNotes.join(" "), /注意來車與落枝/);
  assert.match(wt03.safetyNotes.join(" "), /請勿攀爬[\s\S]*採摘[\s\S]*破壞樹皮/);
  assert.doesNotMatch(wt03.safetyNotes.join(" "), /土地公有|可自由進入/);

  assert.equal(collection.publicationStatus, "approved");
  assert.equal(collection.publiclyListed, true);
  assert.equal(wantan.publicationStatus, "approved");
  assert.equal(wantan.publiclyListed, true);
  assert.ok(wantan.stops.every((stop) => stop.publicationStatus === "approved"));
  assert.equal(yanguan.publicationStatus, "draft");
  assert.equal(yanguan.publiclyListed, false);
  assert.ok(yanguan.stops.every((stop) => stop.publicationStatus === "draft"));

  const publicWt03 = selectPublicDigitalWalkStop(wt03);
  assert.equal(publicWt03.coverImage, "");
  assert.deepEqual(publicWt03.images, []);
  assert.equal(publicWt03.privateLand, null);
  assert.match(publicWt03.safetyNotes.join(" "), /公共道路沿線觀看[\s\S]*不需進入私人土地/);

  assert.match(source, /renderDigitalWalkPublicCollection\(publicCollection\)/);
  assert.match(index, /href="#\/digital\/chilan-walk">赤蘭溪數位走讀<\/a>/);
});

test("首頁鄉鎮使用正式公開活動動態計數且不再輸出連結", () => {
  assert.match(platform, /<script src="activities-data\.js"><\/script>[\s\S]*?<script src="data\/platform-home-data\.js"><\/script>/);
  assert.match(platformSource, /activity\["是否公開"\] === "是"/);
  assert.match(platformSource, /const districts = new Set/);
  assert.match(platformSource, /<div class="place-item"/);
  assert.doesNotMatch(platformSource, /<a href="\$\{escapeHtml\(place\.href\)\}"/);
  assert.match(platformStyles, /\.place-count\s*\{[\s\S]*margin-left:\s*auto/);

  const districtCounts = new Map();
  activities.filter((activity) => activity["是否公開"] === "是").forEach((activity) => {
    const districts = new Set(activity["鄉鎮市區"].split(/[、,，/／;；\s]+/).filter(Boolean));
    districts.forEach((district) => districtCounts.set(district, (districtCounts.get(district) || 0) + 1));
  });
  assert.deepEqual(
    ["朴子市", "水上鄉", "新港鄉", "太保市", "中埔鄉", "鹿草鄉", "六腳鄉", "義竹鄉", "東石鄉", "布袋鎮"]
      .map((district) => districtCounts.get(district) || 0),
    [19, 8, 5, 0, 10, 2, 6, 9, 6, 2],
  );
});

test("首頁移除 ABOUT YIMI 區塊與專用渲染呼叫", () => {
  assert.doesNotMatch(platform, /platform-about|ABOUT YIMI|about-image|about-text|認識平台成果/);
  assert.doesNotMatch(platformSource, /function renderAbout|renderAbout\(/);
  assert.match(platformSource, /href === "#platform-about"[\s\S]*href: "index\.html#\/about"/);
});

test("班級卡摘要使用 CSS 兩行 clamp、SDG 精簡、CTA 靠底", () => {
  assert.match(styles, /\.class-result-card-summary\s*\{[\s\S]*-webkit-line-clamp:\s*2/);
  assert.match(styles, /\.showcase-view-link\s*\{[\s\S]*margin-top:\s*auto/);
  assert.match(source, /visibleClassSdgs[\s\S]*\.slice\(0, 2\)/);
  assert.match(source, /hiddenClassSdgs[\s\S]*\+\$\{hiddenClassSdgs\}/);
});

test("班級與活動卡片維持 lazy loading，空分類使用不可操作狀態", () => {
  assert.match(source, /activityMiniCard[\s\S]*loading="lazy"/);
  assert.match(source, /lazyImage \? ' loading="lazy"'/);
  assert.match(source, /<span class="showcase-card-link is-disabled" aria-disabled="true">/);
  assert.doesNotMatch(source, /class="showcase-card-link is-disabled" href=/);
});
