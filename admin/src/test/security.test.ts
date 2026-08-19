import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

it("admin source 與 env example 不含 server-only secret 變數或真實 credential", () => {
  const root = resolve(import.meta.dirname, "../..");
  const content = [...sourceFiles(join(root, "src")), join(root, ".env.example")].map((path) => readFileSync(path, "utf8")).join("\n");
  const serverOnlyNames = [
    ["SUPABASE", "SERVICE", "ROLE", "KEY"],
    ["SUPABASE", "DB", "PASSWORD"],
    ["SUPABASE", "ACCESS", "TOKEN"],
    ["GITHUB", "PRIVATE", "KEY"],
  ].map((parts) => parts.join("_"));
  for (const name of serverOnlyNames) expect(content).not.toContain(name);
  expect(content).not.toMatch(new RegExp(`${["sb", "secret"].join("_")}_[A-Za-z0-9_-]{16,}`));
  expect(content).not.toContain(["-----BEGIN", "PRIVATE KEY-----"].join(" "));
  expect(readFileSync(join(root, ".env.example"), "utf8")).toMatch(/^VITE_SUPABASE_URL=/m);
  expect(readFileSync(join(root, ".env.example"), "utf8")).toMatch(/^VITE_SUPABASE_PUBLISHABLE_KEY=/m);
});
