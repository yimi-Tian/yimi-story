import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness({ dirty }: { dirty: boolean }) {
  useUnsavedChangesWarning(dirty);
  return <Link to="/activities">活動成果</Link>;
}

test("dirty 表單會攔截 BrowserRouter 相容的站內連結離開", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<MemoryRouter><Harness dirty /></MemoryRouter>);
  const allowed = fireEvent.click(screen.getByRole("link", { name: "活動成果" }));
  expect(allowed).toBe(false);
  expect(confirm).toHaveBeenCalledWith("尚有未儲存的變更，確定要離開嗎？");
});

test("乾淨表單不顯示離開確認", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<MemoryRouter><Harness dirty={false} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("link", { name: "活動成果" }));
  expect(confirm).not.toHaveBeenCalled();
});
