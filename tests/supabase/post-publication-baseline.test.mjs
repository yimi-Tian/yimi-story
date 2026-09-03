import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCsv } from "../../tools/content/csv.mjs";
import { validateImageReference } from "../../tools/content/validate-image-url.mjs";
import { runExistingContentDryRun } from "../../tools/import-existing-content-dry-run.mjs";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const { resolvePublicCover } = require("../../js/public-ux.js");
const settings = JSON.parse(await readFile(resolve(root, "config/content-settings.json"), "utf8"));
const activities = parseCsv(await readFile(resolve(root, "activities.csv"), "utf8"));
const activity = activities.find((row) => row["活動ID"] === "115-002");
const publicUrls = [activity?.["封面照片路徑"], ...(activity?.["成果照片路徑"] || "").split(",")].filter(Boolean);

test("發布後正式資料維持 56 班級、64 活動，且 115-002 只出現一次", async () => {
  const classes = JSON.parse(await readFile(resolve(root, "data/class-results.json"), "utf8"));
  assert.equal(classes.length, 56);
  assert.equal(activities.length, 64);
  assert.equal(activities.filter((row) => row["活動ID"] === "115-002").length, 1);
  assert.equal(activity["活動名稱"], "木藝傳情‧修繕送暖");
});

test("115-002 cover 與 gallery 使用三個無簽名 cms-public HTTPS URL", async () => {
  assert.equal(publicUrls.length, 3);
  for (const url of publicUrls) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:");
    assert.equal(settings.allowedExternalImageHosts.includes(parsed.hostname), true);
    assert.match(parsed.pathname, /\/storage\/v1\/object\/public\/cms-public\//);
    assert.equal(parsed.search, "");
    assert.equal((await validateImageReference(url, { settings })).valid, true);
  }
});

test("發布後 dry-run 同時接受 714 個既有相對圖片與 3 個 cms-public 圖片", async () => {
  const result = await runExistingContentDryRun({ siteRoot: root });
  assert.equal(result.report.classResultSourceCount, 56);
  assert.equal(result.report.activitySourceCount, 64);
  assert.equal(result.report.validationErrorCount, 0);
  assert.equal(result.report.duplicateIds.length, 0);
  assert.equal(result.report.relativeImageCount, 714);
  assert.equal(result.report.httpsImageCount, 3);
});

test("發布後圖片契約仍拒絕任意 host、cms-drafts 與 signed URL", async () => {
  assert.equal((await validateImageReference("https://example.com/a.jpg", { settings })).valid, false);
  assert.equal((await validateImageReference(`https://${settings.allowedExternalImageHosts[0]}/storage/v1/object/public/cms-drafts/a.jpg`, { settings })).valid, false);
  assert.equal((await validateImageReference(`${publicUrls[0]}?token=secret`, { settings })).valid, false);
});

test("115-002 list/detail 共用 explicit cover，不受 gallery fallback 影響", () => {
  const gallery = (activity["成果照片路徑"] || "").split(",").filter(Boolean);
  const listCover = resolvePublicCover({ explicitCover: activity["封面照片路徑"], gallery });
  const detailCover = resolvePublicCover({ explicitCover: activity["封面照片路徑"], gallery });
  assert.equal(listCover.src, publicUrls[0]);
  assert.equal(detailCover.src, publicUrls[0]);
});
