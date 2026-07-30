import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN_YG01_COVER = "public/images/digital/digital-walks/DW-YG-001/YG-01/cover.jpg";
const WANTAN_ROUTE_ID = "DW-WT-001";
const WANTAN_TOBACCO_BUILDING_STOP_ID = "WT-05";
const WANTAN_MANGO_TREE_STOP_ID = "WT-03";
const WOOD_REPAIR_CLUB_ID = "wood-repair";
const DANCE_CLUB_ID = "multi-cultural-dance";
const targets = [
  { json: "data/showcase.json", js: "data/showcase-data.js", globalName: "SHOWCASE_DATA" },
  { json: "data/class-results.json", js: "data/class-results-data.js", globalName: "CLASS_RESULTS_DATA" },
  {
    json: "data/digital-walks.json",
    js: "data/digital-walks-data.js",
    globalName: "DIGITAL_WALKS_DATA",
    validate: validateDigitalWalks,
  },
  {
    json: "data/clubs.json",
    js: "data/clubs-data.js",
    globalName: "CLUBS_DATA",
    validate: validateClubs,
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

async function validateClubs(data) {
  const clubs = Array.isArray(data?.clubs) ? data.clubs : [];
  const clubIds = new Set();
  const displayOrders = new Set();
  const forbiddenKeys = new Set([
    "address",
    "contact",
    "contactname",
    "contactperson",
    "email",
    "fee",
    "idnumber",
    "memberlist",
    "membernames",
    "nationalid",
    "phone",
    "roster",
  ]);

  for (const club of clubs) {
    assertUnique(clubIds, club.id, "社團 ID");
    assertUnique(displayOrders, club.displayOrder, "社團 displayOrder");
    if (club.publicationStatus === "draft" && club.publiclyListed !== false) {
      throw new Error(`草稿社團 ${club.id} 不得進入公開列表，publiclyListed 必須為 false。`);
    }

    walkClubData(club, (key, value) => {
      if (forbiddenKeys.has(String(key).toLowerCase())) {
        throw new Error(`社團 ${club.id} 不得包含個資或內部欄位：${key}`);
      }
      if (typeof value !== "string") return;
      if (/public\/docs\/|\.docx\b/i.test(value)) {
        throw new Error(`社團 ${club.id} 不得公開 Word 文件路徑。`);
      }
      if (/[A-Z][12]\d{8}/.test(value) || /(?:\+?886[-\s]?)?09\d{8}/.test(value) || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value)) {
        throw new Error(`社團 ${club.id} 疑似包含身分證、電話或 Email。`);
      }
      if (/聯絡地址|住址|社員名冊|成員名冊/.test(value)) {
        throw new Error(`社團 ${club.id} 疑似包含地址或名冊內容。`);
      }
    });

    const imagePaths = [
      club.coverImage,
      ...(Array.isArray(club.gallery) ? club.gallery.map((item) => typeof item === "string" ? item : item?.src) : []),
    ].filter(Boolean);
    for (const imagePath of imagePaths) await assertExactRelativePath(imagePath);
  }

  const woodRepair = clubs.find((club) => club.id === WOOD_REPAIR_CLUB_ID);
  if (!woodRepair || woodRepair.publicationStatus !== "approved" || woodRepair.publiclyListed !== true) {
    throw new Error("木工修繕社必須維持正式公開狀態與既有路由 wood-repair。");
  }
  if (JSON.stringify(woodRepair.relatedActivityIds) !== JSON.stringify(["113-002", "114-022"])) {
    throw new Error("木工修繕社 relatedActivityIds 必須維持 113-002、114-022。");
  }

  const danceClub = clubs.find((club) => club.id === DANCE_CLUB_ID);
  if (!danceClub || danceClub.publicationStatus !== "draft" || danceClub.publiclyListed !== false) {
    throw new Error("多元文化運動舞蹈社必須維持 draft 且 publiclyListed 為 false。");
  }
  if (/112\s*年.{0,4}成立|成立.{0,4}112\s*年/.test(JSON.stringify(danceClub))) {
    throw new Error("多元文化運動舞蹈社不得寫成 112 年成立。");
  }
  const expectedCardTags = ["社區健康推廣", "地方文化與信仰活動", "公益與長者關懷", "公共活動展演"];
  if (JSON.stringify(danceClub.cardTags) !== JSON.stringify(expectedCardTags)) {
    throw new Error("多元文化運動舞蹈社列表卡片必須維持指定的 4 個代表標籤。");
  }
  if (
    danceClub.coverImageRightsStatus !== "approved"
    || !Array.isArray(danceClub.gallery)
    || danceClub.gallery.length !== 4
    || danceClub.gallery.some((item) => item?.rightsStatus !== "approved")
  ) {
    throw new Error("多元文化運動舞蹈社目前使用的 5 張照片必須標示為 approved。");
  }
  const expectedSourceLabels = [
    "112年社團活動紀錄",
    "113年社團活動紀錄",
    "114年社團活動紀錄",
    "邑米社區大學社團影像紀錄",
  ];
  if (JSON.stringify(danceClub.sources?.map((item) => item.displayLabel)) !== JSON.stringify(expectedSourceLabels)) {
    throw new Error("多元文化運動舞蹈社前台資料來源名稱不正確。");
  }
  if (!Array.isArray(danceClub.pendingItems) || danceClub.pendingItems.length !== 6) {
    throw new Error("多元文化運動舞蹈社草稿必須保留 6 項待確認資料。");
  }
}

function walkClubData(value, visitor, key = "") {
  visitor(key, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkClubData(item, visitor, String(index)));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([childKey, childValue]) => walkClubData(childValue, visitor, childKey));
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
