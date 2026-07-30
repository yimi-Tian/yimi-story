import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN_YG01_COVER = "public/images/digital/digital-walks/DW-YG-001/YG-01/cover.jpg";
const WANTAN_ROUTE_ID = "DW-WT-001";
const WANTAN_TOBACCO_BUILDING_STOP_ID = "WT-05";
const WANTAN_MANGO_TREE_STOP_ID = "WT-03";
const targets = [
  { json: "data/showcase.json", js: "data/showcase-data.js", globalName: "SHOWCASE_DATA" },
  { json: "data/class-results.json", js: "data/class-results-data.js", globalName: "CLASS_RESULTS_DATA" },
  {
    json: "data/digital-walks.json",
    js: "data/digital-walks-data.js",
    globalName: "DIGITAL_WALKS_DATA",
    validate: validateDigitalWalks,
  },
];

const loadedTargets = [];
for (const target of targets) {
  const jsonPath = resolve(siteRoot, target.json);
  const data = JSON.parse(await readFile(jsonPath, "utf8"));
  if (target.validate) await target.validate(data);
  loadedTargets.push({ ...target, data });
}

for (const target of loadedTargets) {
  const jsPath = resolve(siteRoot, target.js);
  const { data } = target;
  const output = `// Generated from ${target.json} by tools/sync-static-data.mjs. Do not edit by hand.\nwindow.${target.globalName} = ${JSON.stringify(data, null, 2)};\n`;
  await writeFile(jsPath, output, "utf8");
  console.log(`Updated ${target.js}`);
}

async function validateDigitalWalks(data) {
  const routes = Array.isArray(data?.routes) ? data.routes : [];
  const routeIds = new Set();
  const stopIds = new Set();

  for (const route of routes) {
    assertUnique(routeIds, route.id, "路線 ID");
    if (route.publicationStatus === "draft" && route.publiclyListed !== false) {
      throw new Error(`草稿路線 ${route.id} 不得進入公開列表，publiclyListed 必須為 false。`);
    }

    const stops = Array.isArray(route.stops) ? route.stops : [];
    if (Number(route.stopCount) !== stops.length) {
      throw new Error(`路線 ${route.id} 的 stopCount 與站點資料數量不一致。`);
    }
    const orders = new Set();
    for (const stop of stops) {
      assertUnique(stopIds, stop.id, "站點 ID");
      assertUnique(orders, stop.order, `${route.id} 站點順序`);
      if (stop.routeId !== route.id) {
        throw new Error(`站點 ${stop.id} 的 routeId 與所屬路線 ${route.id} 不一致。`);
      }
      if (route.publicationStatus === "draft" && stop.publicationStatus !== "draft") {
        throw new Error(`草稿路線 ${route.id} 的站點 ${stop.id} 必須維持 draft。`);
      }
    }
    for (let order = 1; order <= stops.length; order += 1) {
      if (!orders.has(order)) throw new Error(`路線 ${route.id} 的站點順序必須連續為 1 至 ${stops.length}。`);
    }

    if (route.id === WANTAN_ROUTE_ID) validateWantanRoute(route);

    const imagePaths = [
      route.coverImage,
      route.routeMapImage,
      ...stops.flatMap((stop) => [stop.coverImage, ...(Array.isArray(stop.images) ? stop.images : [])]),
    ].filter(Boolean);

    if (imagePaths.includes(FORBIDDEN_YG01_COVER)) {
      throw new Error("YG-01 的 Google 街景 cover.jpg 不得設為網站圖片。");
    }
    for (const imagePath of imagePaths) await assertExactRelativePath(imagePath);
  }
}

function validateWantanRoute(route) {
  const mangoTree = route.stops.find((stop) => stop.id === WANTAN_MANGO_TREE_STOP_ID);
  if (!mangoTree || !Array.isArray(mangoTree.images) || mangoTree.images.length !== 0) {
    throw new Error("WT-03 百年芒果樹不得引用竹管厝或其他補充照片，images 必須為空陣列。");
  }

  const tobaccoBuilding = route.stops.find((stop) => stop.id === WANTAN_TOBACCO_BUILDING_STOP_ID);
  if (!tobaccoBuilding || tobaccoBuilding.name !== "灣潭煙樓") {
    throw new Error("WT-05 正式站名必須為「灣潭煙樓」。");
  }
  if (route.title.includes("灣潭菸樓") || JSON.stringify(tobaccoBuilding).includes("灣潭菸樓")) {
    throw new Error("灣潭正式建築名稱不得寫成「灣潭菸樓」。");
  }
}

function assertUnique(seen, value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} 不得為空。`);
  }
  if (seen.has(value)) throw new Error(`${label} 重複：${value}`);
  seen.add(value);
}

async function assertExactRelativePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.startsWith("public/images/") || relativePath.includes("..")) {
    throw new Error(`圖片路徑格式不正確：${relativePath}`);
  }

  let current = siteRoot;
  for (const segment of relativePath.split("/")) {
    const entries = await readdir(current);
    if (!entries.includes(segment)) {
      throw new Error(`圖片路徑不存在或大小寫不符：${relativePath}`);
    }
    current = resolve(current, segment);
  }
}
