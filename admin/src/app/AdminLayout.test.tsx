import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { AdminLayout } from "./AdminLayout";

it("登出後返回 login", async () => {
  const signOut = vi.fn().mockResolvedValue(undefined);
  const value: AuthContextValue = { status: "authenticated", user: { email: "admin@example.test" } as never, signIn: vi.fn(), signOut };
  render(<AuthContext.Provider value={value}><MemoryRouter initialEntries={["/dashboard"]}><Routes><Route path="/dashboard" element={<AdminLayout />}><Route index element={<div>總覽內容</div>} /></Route><Route path="/login" element={<div>登入頁</div>} /></Routes></MemoryRouter></AuthContext.Provider>);
  await userEvent.click(screen.getByRole("button", { name: "登出" }));
  expect(signOut).toHaveBeenCalledOnce();
  expect(screen.getByText("登入頁")).toBeInTheDocument();
});
