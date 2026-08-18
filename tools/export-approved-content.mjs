import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportActivities } from "./export-activities.mjs";
import { exportClassResults } from "./export-class-results.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(argv) {
  const args = { write: false, input: null, outputRoot: siteRoot };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--write") args.write = true;
    else if (argv[index] === "--input") args.input = argv[++index];
    else if (argv[index] === "--output-root") args.outputRoot = resolve(argv[++index]);
    else throw new Error(`未知參數：${argv[index]}`);
  }
  if (!args.input) throw new Error("必須提供 --input <approved-content.json>。");
  return args;
}

export async function buildApprovedContentOutputs(input, options = {}) {
  const classOutput = await exportClassResults(input.classResults || [], options);
  const activityOutput = await exportActivities(input.activities || [], options);
  return new Map([
    ["data/class-results.json", classOutput.jsonText],
    ["data/class-results-data.js", classOutput.fallbackText],
    ["activities.csv", activityOutput.csvText],
    ["activities-data.js", activityOutput.fallbackText],
  ]);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const input = JSON.parse(await readFile(resolve(args.input), "utf8"));
  const outputs = await buildApprovedContentOutputs(input, { siteRoot, legacyImport: input.legacyImport === true });
  for (const [relativePath, contents] of outputs) {
    const hash = createHash("sha256").update(contents).digest("hex");
    console.log(`${relativePath}\t${Buffer.byteLength(contents)} bytes\tsha256:${hash}`);
    if (args.write) {
      const target = resolve(args.outputRoot, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents, "utf8");
    }
  }
  if (!args.write) console.log("Dry run only. Add --write to write the four approved output files.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
