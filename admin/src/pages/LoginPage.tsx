import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type SignInResult } from "../auth/AuthContext";

const messages: Record<Exclude<SignInResult, "success">, string> = {
  invalid_credentials: "帳號或密碼錯誤，請重新確認。",
  denied: "此帳號沒有後台權限。",
  inactive: "此帳號已停用，請聯絡系統管理員。",
  network_error: "系統連線失敗，請稍後再試。",
};

export function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { reason?: string; passwordUpdated?: boolean } | null;
  const routeReason = routeState?.reason;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(routeReason === "inactive" ? messages.inactive : routeReason === "denied" ? messages.denied : routeReason === "error" ? messages.network_error : "");
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result === "success") navigate("/dashboard", { replace: true });
    else setError(messages[result]);
  }

  return <main className="login-page">
    <section className="login-intro">
      <div className="brand-mark brand-mark--large" aria-hidden="true">邑</div>
      <p className="eyebrow">YIMI LOCAL KNOWLEDGE</p>
      <h1>讓地方故事被好好整理，也被長久看見。</h1>
      <p>邑米地方知識探索平台後台，提供授權管理員維護班級成果與活動紀錄。</p>
    </section>
    <section className="login-panel" aria-labelledby="login-heading">
      <div><p className="eyebrow">管理員專區</p><h2 id="login-heading">登入後台</h2><p className="muted">請使用已授權的管理員帳號。</p></div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="password">密碼</label>
        <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <Link className="text-link password-help" to="/forgot-password">忘記密碼？</Link>
        {routeState?.passwordUpdated && <div className="notice notice--success" role="status">密碼已更新，請使用新密碼登入。</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? "登入中…" : "登入"}</button>
      </form>
      <p className="security-note">本後台不提供公開註冊。所有資料權限均由 Supabase Auth 與 RLS 驗證。</p>
    </section>
  </main>;
}
