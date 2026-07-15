import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  { json: "data/showcase.json", js: "data/showcase-data.js", globalName: "SHOWCASE_DATA" },
  { json: "data/class-results.json", js: "data/class-results-data.js", globalName: "CLASS_RESULTS_DATA" },
];

for (const target of targets) {
  const jsonPath = resolve(siteRoot, target.json);
  const jsPath = resolve(siteRoot, target.js);
  const data = JSON.parse(await readFile(jsonPath, "utf8"));
  const output = `// Generated from ${target.json} by tools/sync-static-data.mjs. Do not edit by hand.\nwindow.${target.globalName} = ${JSON.stringify(data, null, 2)};\n`;
  await writeFile(jsPath, output, "utf8");
  console.log(`Updated ${target.js}`);
}
