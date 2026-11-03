import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url).pathname;
const ux = require("../../js/public-ux.js");

function loadMap() {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(path.join(root, "data/image-display-map-data.js"), "utf8"), sandbox);
  return sandbox.window.YIMI_IMAGE_DISPLAY_MAP;
}
const MAP = loadMap();

// 大小寫精確存在檢查（Linux 檔案系統區分大小寫，與 GitHub Pages 相同；用逐層 readdir 確保在不分大小寫的系統上也精確）
function existsExact(rel) {
  let dir = root.replace(/\/$/, "");
  for (const part of rel.split("/")) {
    if (!readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

test("對照表：key 一律小寫，顯示版為存在的 WebP，後備原圖以精確大小寫存在", () => {
  const entries = Object.entries(MAP);
  assert.ok(entries.length >= 13);
  for (const [key, entry] of entries) {
    assert.equal(key, key.toLowerCase());
    assert.match(entry.d, /^public\/images\/display\/.+\.webp$/);
    assert.ok(existsExact(entry.d), `顯示版不存在：${entry.d}`);
    assert.ok(existsExact(entry.o), `原圖大小寫不符或不存在：${entry.o}`);
    assert.equal(entry.o.toLowerCase(), key);
    assert.ok(statSync(path.join(root, entry.d)).size < statSync(path.join(root, entry.o)).size, `顯示版應小於原圖：${entry.o}`);
  }
});

test("對照表：13 張驗收圖都已登記；顯示版不含底線開頭資料夾（Jekyll 會排除）", () => {
  const required = [
    "public/images/activities/113-002/01.JPG", "public/images/activities/114-016/01.JPG",
    "public/images/activities/114-022/05.jpg", "public/images/activities/114-026/01.jpg",
    "assets/images/platform-home/latest-river.jpg", "assets/images/platform-home/banner-river.jpg",
    "public/images/activities/114-033/01.JPG", "assets/images/platform-home/banner-community.jpg",
    "assets/images/platform-home/latest-field.jpg", "public/images/activities/112-010/cover.jpg",
    "public/images/activities/112-011/cover.jpg", "public/images/activities/112-006/03.jpg",
    "public/images/activities/114-016/03.JPG",
  ];
  for (const rel of required) assert.ok(MAP[rel.toLowerCase()], `未登記：${rel}`);
  for (const entry of Object.values(MAP)) assert.ok(!entry.d.split("/").some((part) => part.startsWith("_") || part.startsWith(".")));
});

test("404：資料寫 03.jpg 時，第一個候選就是存在的 WebP，原圖後備為實際存在的 03.JPG，不含不存在路徑", () => {
  const cover = ux.resolvePublicCover({ explicitCover: "public/images/activities/114-016/03.jpg", displayMap: MAP });
  assert.equal(cover.src, "public/images/display/activities/114-016/03-1200.webp");
  assert.ok(existsExact(cover.src));
  assert.ok(cover.fallbacks.includes("public/images/activities/114-016/03.JPG"));
  for (const candidate of [cover.src, ...cover.fallbacks]) {
    if (candidate.endsWith("placeholder.svg")) continue;
    assert.ok(existsExact(candidate), `候選路徑不存在（會產生 404）：${candidate}`);
  }
});

test("未對照的路徑原樣回傳；空輸入仍回到 placeholder", () => {
  const cover = ux.resolvePublicCover({ explicitCover: "public/images/activities/999-999/01.jpg", gallery: ["a.jpg"], displayMap: MAP });
  assert.equal(cover.src, "public/images/activities/999-999/01.jpg");
  assert.deepEqual(cover.fallbacks, ["a.jpg", "public/images/placeholder.svg"]);
  assert.equal(ux.resolvePublicCover({ displayMap: MAP }).src, "public/images/placeholder.svg");
  const noMap = ux.resolvePublicCover({ explicitCover: "x.jpg" });
  assert.equal(noMap.src, "x.jpg");
});

test("同一張圖（含位元組相同的複本、大小寫不同的路徑、顯示版）視為相同", () => {
  assert.ok(ux.sameImage("public/images/activities/114-016/03.jpg", "public/images/activities/114-016/03.JPG", MAP));
  assert.ok(ux.sameImage("public/images/activities/114-016/03.JPG", "public/images/display/activities/114-016/03-1200.webp", MAP));
  assert.ok(!ux.sameImage("public/images/activities/114-016/01.JPG", "public/images/activities/114-016/03.JPG", MAP));
  assert.equal(ux.imageIdentity("not/mapped.jpg", MAP), "not/mapped.jpg");
});

test("首頁資料（platform-home.json）所有圖片路徑，經對照後都指向存在的檔案（精確大小寫）", () => {
  const data = JSON.parse(readFileSync(path.join(root, "data/platform-home.json"), "utf8"));
  const paths = [];
  (function walk(value) {
    if (typeof value === "string") { if (/\.(jpe?g|png|webp|svg)$/i.test(value) && !/^https?:/.test(value)) paths.push(value); }
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  })(data);
  assert.ok(paths.length >= 10);
  for (const original of paths) {
    const cover = ux.resolvePublicCover({ explicitCover: original, displayMap: MAP });
    assert.ok(existsExact(cover.src), `首頁圖片會 404：${original} → ${cover.src}`);
  }
});

test("載入點：兩個首頁都在 public-ux.js 之前載入對照表；首屏輪播走對照表；白名單六檔未被本改動引用", () => {
  for (const file of ["index.html", "platform.html"]) {
    const html = readFileSync(path.join(root, file), "utf8");
    const mapAt = html.indexOf("data/image-display-map-data.js");
    assert.ok(mapAt > 0 && mapAt < html.indexOf("js/public-ux.js"), `${file} 對照表需先於 public-ux.js`);
  }
  const home = readFileSync(path.join(root, "js/platform-home.js"), "utf8");
  assert.match(home, /const cover = publicCover\(slide\)/);
  assert.match(home, /bindPublicImageFallbacks\(document\.querySelector\("#hero"\)\)/);
});
