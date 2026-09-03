import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildBaselinePlan } from "../../tools/baseline/build-baseline.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(repositoryRoot, "tests/fixtures/stage3-historical-baseline.json");

export async function createStage3HistoricalSiteRoot() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const root = await mkdtemp(join(tmpdir(), "yimi-stage3-baseline-"));
  const sources = [
    ["data/class-results.json", fixture.classResultsBlobSha],
    ["activities.csv", fixture.activitiesBlobSha],
  ];

  try {
    for (const [relativePath, expectedBlobSha] of sources) {
      const actualBlobSha = execFileSync("git", ["rev-parse", `${fixture.sourceCommit}:${relativePath}`], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim();
      if (actualBlobSha !== expectedBlobSha) throw new Error(`Stage 3 fixture blob 不符：${relativePath}`);
      const bytes = execFileSync("git", ["show", `${fixture.sourceCommit}:${relativePath}`], {
        cwd: repositoryRoot,
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
      });
      const destination = resolve(root, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }

    await mkdir(resolve(root, "config"), { recursive: true });
    await writeFile(
      resolve(root, "config/content-settings.json"),
      await readFile(resolve(repositoryRoot, "config/content-settings.json")),
    );
    await mkdir(resolve(root, "public"), { recursive: true });
    await symlink(
      resolve(repositoryRoot, "public/images"),
      resolve(root, "public/images"),
      process.platform === "win32" ? "junction" : "dir",
    );

    return {
      root,
      fixture,
      async cleanup() {
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function buildStage3HistoricalBaselinePlan() {
  const historicalSite = await createStage3HistoricalSiteRoot();
  try {
    return await buildBaselinePlan({ siteRoot: historicalSite.root });
  } finally {
    await historicalSite.cleanup();
  }
}
