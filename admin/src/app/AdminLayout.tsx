import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const futureItems = ["班級花絮", "活動成果", "媒體", "發布"];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }
  return <div className="admin-shell">
    <aside className="sidebar">
      <div className="brand-mark" aria-hidden="true">邑</div>
      <div className="brand-copy"><strong>邑米地方知識探索平台</strong><span>後台管理</span></div>
      <nav aria-label="後台主要選單">
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link is-active" : "nav-link"}>總覽</NavLink>
        {futureItems.map((item) => <span className="nav-link is-disabled" key={item}>{item}<small>建置中</small></span>)}
      </nav>
    </aside>
    <div className="admin-workspace">
      <header className="topbar"><div><span className="eyebrow">管理員</span><strong>{user?.email ?? "已驗證帳號"}</strong></div><button className="button button--ghost" type="button" onClick={handleSignOut}>登出</button></header>
      <main className="main-content"><Outlet /></main>
    </div>
  </div>;
}
