import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { parseCsv } from "../../tools/content/csv.mjs";
import { exportActivities } from "../../tools/export-activities.mjs";
import { exportClassResults } from "../../tools/export-class-results.mjs";
import { runExistingContentDryRun } from "../../tools/import-existing-content-dry-run.mjs";

const root = resolve(import.meta.dirname, "../..");
const expectedHashes = {
  "data/class-results.json": "fa31e8a55b528a89ed7257867340967fa81f5072ab897cdcbf21aa804802083d",
  "data/class-results-data.js": "135adf9bc46a3a389a51963c3aaa9bb27c4a5a49bf9721ba81a9d39170191587",
  "activities.csv": "6970b2314e86634b9fb3cfa7ccca0821c93bb5338338d443e6f0e0201d1a7c0a",
  "activities-data.js": "132219673fe27f6fd1c6bba24db715c5d90024d373a78b6e6de34e7dc4709362",
};

function untrackedFiles() {
  return execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
}

test("既有正式資料檔內容未被階段 1 修改", async () => {
  for (const [path, expected] of Object.entries(expectedHashes)) {
    const contents = await readFile(resolve(root, path));
    assert.equal(createHash("sha256").update(contents).digest("hex"), expected, path);
  }
});

test("dry-run 轉換 56 筆班級與 63 筆活動，且不改變未追蹤檔案", async () => {
  const before = untrackedFiles();
  const result = await runExistingContentDryRun({ siteRoot: root });
  const after = untrackedFiles();
  assert.deepEqual(after, before);
  assert.equal(result.report.classResultSourceCount, 56);
  assert.equal(result.report.classResultSuccessCount, 56);
  assert.equal(result.report.activitySourceCount, 63);
  assert.equal(result.report.activitySuccessCount, 63);
  assert.equal(result.report.validationErrorCount, 0);
  assert.equal(result.report.unparsedLegacyDateCount, 63);
  assert.equal(result.report.httpsImageCount, 0);
});

test("既有圖片參照與筆數通過 deterministic exporter 回歸", async () => {
  const result = await runExistingContentDryRun({ siteRoot: root });
  const classOutput = await exportClassResults(result.classResults, {
    settings: await import("../../tools/content/validate-image-url.mjs").then((module) => module.loadContentSettings()),
    legacyImport: true,
  });
  const activityOutput = await exportActivities(result.activities, {
    settings: await import("../../tools/content/validate-image-url.mjs").then((module) => module.loadContentSettings()),
    legacyImport: true,
  });
  assert.equal(classOutput.published.length, 56);
  assert.equal(activityOutput.rows.length, 63);

  const originalActivities = result.activitySource;
  const exportedActivities = parseCsv(activityOutput.csvText);
  for (let index = 0; index < originalActivities.length; index += 1) {
    assert.equal(exportedActivities[index]["封面照片路徑"], originalActivities[index]["封面照片路徑"], originalActivities[index]["活動ID"]);
    assert.equal(exportedActivities[index]["成果照片路徑"], originalActivities[index]["成果照片路徑"], originalActivities[index]["活動ID"]);
  }
  for (let index = 0; index < result.classSource.length; index += 1) {
    assert.equal(classOutput.published[index].coverImage, result.classSource[index].coverImage);
    assert.deepEqual(classOutput.published[index].images, result.classSource[index].images);
  }

  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(activityOutput.fallbackText, context);
  assert.deepEqual(parseCsv(context.window.ACTIVITIES_CSV), exportedActivities);
});

test("首頁活動統計仍為 63", async () => {
  const home = JSON.parse(await readFile(resolve(root, "data/platform-home.json"), "utf8"));
  assert.equal(home.platformStats.find((item) => item.label === "活動成果")?.value, "63");
});
