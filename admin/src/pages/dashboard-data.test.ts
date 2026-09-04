import { expect, it } from "vitest";
import { fetchDashboardCounts } from "./dashboard-data";

it("Dashboard readonly counts exclude auto-created identical drafts regardless of revision", async () => {
  const requested: string[] = [];
  const counts: Record<string, number> = { "content_items:class_result": 56, "content_items:activity": 64, publication_snapshots: 120, media_assets: 728 };
  const rows = [
    { published_snapshot_id: "baseline", drafts: [{ id: "auto", status: "draft", data: { title: "班級", revision: 1 } }], published: { snapshot_data: { title: "班級", revision: 0 } } },
    { published_snapshot_id: "baseline", drafts: [{ id: "changed", status: "draft", data: { title: "新標題" } }], published: { snapshot_data: { title: "舊標題" } } },
    { published_snapshot_id: null, drafts: [{ id: "new", status: "validated", data: { title: "新內容" } }], published: null },
  ];
  const client = { from(table: string) { return { select(selection: string) {
    if (selection !== "id") { requested.push(selection); return { order() { return { range() { return Promise.resolve({ data: rows, error: null }); } }; } }; }
    return { eq(_field: string, value: string) { requested.push(table + ":" + value); return Promise.resolve({ count: counts[table + ":" + value], error: null }); }, then(resolve: (value: unknown) => void) { requested.push(table); return Promise.resolve({ count: counts[table], error: null }).then(resolve); } };
  } }; } } as never;
  await expect(fetchDashboardCounts(client)).resolves.toEqual({ classResults: 56, activities: 64, published: 120, media: 728, drafts: 2, needsValidation: 1 });
  expect(requested.some((s) => s.includes("published_snapshot_id_fkey(snapshot_data)"))).toBe(true);
  expect(requested).toContain("content_items:activity");
});
