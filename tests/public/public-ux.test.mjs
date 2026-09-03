import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { parseCsv } from "../../tools/content/csv.mjs";

const require = createRequire(import.meta.url);
const { DEFAULT_BATCH_SIZE, nextVisibleCount, resolvePublicCover, visibleBatch } = require("../../js/public-ux.js");
const root = new URL("../../", import.meta.url);
const source = await readFile(new URL("script.js", root), "utf8");
const styles = await readFile(new URL("styles.css", root), "utf8");
const index = await readFile(new URL("index.html", root), "utf8");
const platform = await readFile(new URL("platform.html", root), "utf8");
const showcase = JSON.parse(await readFile(new URL("data/showcase.json", root), "utf8"));
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
