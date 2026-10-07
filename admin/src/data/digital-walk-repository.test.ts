import { expect, test } from "vitest";
import { getPublishedDigitalWalkOptions, selectPublishedDigitalWalkOptions } from "./digital-walk-repository";

test("formal registry adapter exposes only approved publicly listed routes", () => {
  const routes = getPublishedDigitalWalkOptions();
  expect(routes.length).toBeGreaterThan(0);
  expect(routes.map((route) => route.id)).toEqual(expect.arrayContaining(["DW-WT-001", "DW-YG-001"]));
  expect(routes.every((route) => route.id.startsWith("DW-") && route.title.length > 0)).toBe(true);
});
test("draft and hidden routes are excluded by the adapter", () => {
  expect(selectPublishedDigitalWalkOptions([
    { id: "DW-OK", title: "公開", publicationStatus: "approved", publiclyListed: true },
    { id: "DW-DRAFT", title: "草稿", publicationStatus: "draft", publiclyListed: true },
    { id: "DW-HIDDEN", title: "隱藏", publicationStatus: "approved", publiclyListed: false },
  ])).toEqual([{ id: "DW-OK", title: "公開" }]);
});
