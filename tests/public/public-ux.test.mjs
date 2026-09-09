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

test("地方探索公開選單只顯示可使用的赤蘭溪 AR 走讀", () => {
  assert.match(index, /data-nav="themes">主題館[\s\S]*?#\/themes\/food-agriculture[\s\S]*?#\/themes\/marine-education[\s\S]*?#\/themes\/local-culture[\s\S]*?#\/themes\/environmental-education/);
  assert.match(index, /data-nav="explore">地方探索[\s\S]*?<div class="nav-menu">\s*<a href="#\/digital\/game">赤蘭溪 AR走讀<\/a>\s*<\/div>/);
  assert.doesNotMatch(index, /赤蘭溪探索模組|朴子醫療文化探索|海線生活探索|食農地方探索/);
  assert.doesNotMatch(index, /<div class="nav-menu">[\s\S]*?#\/digital\/(?:chilan-walk|puzi-medical)[\s\S]*?<\/div>/);
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
  assert.equal(collection.publicationStatus, "draft");
  assert.equal(collection.publiclyListed, false);
  assert.equal(getDigitalWalkCollection(digitalWalks, "chilan-walk", "public"), null);
  assert.equal(getDigitalWalkCollection(digitalWalks, "chilan-walk", "draft")?.id, collection.id);
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
  assert.deepEqual(getPublicDigitalWalks(digitalWalks), []);
  assert.deepEqual(
    new Set(getDraftDigitalWalks(digitalWalks).map((route) => route.id)),
    new Set(["DW-WT-001", "DW-YG-001"]),
  );

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

test("赤蘭溪 canonical route 維持 placeholder 且未加入公開 dropdown", () => {
  assert.match(source, /slug: "chilan-walk"/);
  assert.match(source, /數位走讀內容待補/);
  assert.doesNotMatch(index, /href="#\/digital\/chilan-walk"/);
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
