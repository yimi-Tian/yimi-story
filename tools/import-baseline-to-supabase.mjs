import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyBaselinePlan, assertLocalDatabaseUrl, LOCAL_DATABASE_URL } from "./baseline/baseline-db.mjs";
import { buildBaselinePlan } from "./baseline/build-baseline.mjs";

function parseArguments(argv) {
  const modes = argv.filter((arg) => arg === "--dry-run" || arg === "--apply");
  if (modes.length !== 1) throw new Error("必須且只能指定 --dry-run 或 --apply");
  const unknown = argv.filter((arg) => !["--dry-run", "--apply"].includes(arg) && !arg.startsWith("--db-url="));
  if (unknown.length) throw new Error(`不支援的參數：${unknown.join(", ")}`);
  const databaseUrl = argv.find((arg) => arg.startsWith("--db-url="))?.slice("--db-url=".length)
    || process.env.YIMI_BASELINE_DB_URL || process.env.SUPABASE_DB_URL || LOCAL_DATABASE_URL;
  if (modes[0] === "--apply") assertLocalDatabaseUrl(databaseUrl);
  return { mode: modes[0], databaseUrl };
}

export async function runBaselineImport(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const plan = await buildBaselinePlan();
  if (options.mode === "--dry-run") return {
    mode: "dry-run",
    ...plan.report,
    plannedInsertCount: plan.records.length,
    plannedSkipCount: 0,
    plannedConflictCount: 0,
  };
  const result = applyBaselinePlan(plan, { databaseUrl: options.databaseUrl });
  return { mode: "apply", ...plan.report, ...result };
}

async function main() {
  console.log(JSON.stringify(await runBaselineImport(), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
