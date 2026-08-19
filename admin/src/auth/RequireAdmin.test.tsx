import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { RequireAdmin } from "./RequireAdmin";

const base: AuthContextValue = { status: "unauthenticated", user: null, signIn: vi.fn(), signOut: vi.fn() };

function renderGuard(value: AuthContextValue) {
  render(<AuthContext.Provider value={value}><MemoryRouter initialEntries={["/dashboard"]}><Routes><Route path="/login" element={<div>登入頁</div>} /><Route element={<RequireAdmin />}><Route path="/dashboard" element={<div>後台內容</div>} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
}

describe("RequireAdmin", () => {
  it("無 session 導向 login", () => { renderGuard(base); expect(screen.getByText("登入頁")).toBeInTheDocument(); });
  it("active admin 可進 dashboard", () => { renderGuard({ ...base, status: "authenticated" }); expect(screen.getByText("後台內容")).toBeInTheDocument(); });
  it("loading 顯示明確狀態", () => { renderGuard({ ...base, status: "loading" }); expect(screen.getByRole("status")).toHaveTextContent("正在確認後台權限"); });
});
