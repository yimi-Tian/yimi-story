import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const root = process.cwd();
export const migrationDirectory = join(root, "supabase", "migrations");
export const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

export function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

export const coreSql = read(
  "supabase/migrations/202608180001_admin_foundation.sql",
);
export const storageSql = read(
  "supabase/migrations/202608180002_storage_policies.sql",
);

export function policyBlock(sql, policyName) {
  const escaped = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `create\\s+policy\\s+${escaped}\\b([\\s\\S]*?);`,
    "i",
  ).exec(sql);
  return match?.[0] ?? "";
}

export function enumValues(sql, enumName) {
  const escaped = enumName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(
    `create\\s+type\\s+public\\.${escaped}\\s+as\\s+enum\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    "i",
  ).exec(sql)?.[1];

  return body ? [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]) : [];
}
