import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN_YG01_COVER = "public/images/digital/digital-walks/DW-YG-001/YG-01/cover.jpg";
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
    const orders = new Set();
    for (const stop of stops) {
      assertUnique(stopIds, stop.id, "站點 ID");
      assertUnique(orders, stop.order, `${route.id} 站點順序`);
      if (route.publicationStatus === "draft" && stop.publicationStatus !== "draft") {
        throw new Error(`草稿路線 ${route.id} 的站點 ${stop.id} 必須維持 draft。`);
      }
    }

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
