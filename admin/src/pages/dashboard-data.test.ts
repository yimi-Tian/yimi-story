import { expect, it } from "vitest";
import { fetchDashboardCounts } from "./dashboard-data";

it("dashboard 以 Cloud tables 與 content_type filter 讀取即時 count", async () => {
  const requested: string[] = [];
  const counts: Record<string, number> = { "content_items:class_result": 56, "content_items:activity": 63, publication_snapshots: 119, media_assets: 714, content_drafts: 2, "content_drafts:draft": 1 };
  const client = { from(table: string) { return { select() { return { eq(_field: string, value: string) { requested.push(`${table}:${value}`); return Promise.resolve({ count: counts[`${table}:${value}`], error: null }); }, then(resolve: (value: unknown) => void) { requested.push(table); return Promise.resolve({ count: counts[table], error: null }).then(resolve); } }; } }; } } as never;
  await expect(fetchDashboardCounts(client)).resolves.toEqual({ classResults: 56, activities: 63, published: 119, media: 714, drafts: 2, needsValidation: 1 });
  expect(requested).toEqual(expect.arrayContaining(["content_items:class_result", "content_items:activity", "publication_snapshots", "media_assets", "content_drafts", "content_drafts:draft"]));
});
