import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../lib/supabase";
import { updateRecoveredPassword } from "../auth/password-recovery";
import { LoadingState } from "../components/States";

type RecoveryState = "checking" | "ready" | "invalid";

export function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session?.user) setState("ready");
    });
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(data.session?.user ? "ready" : "invalid");
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("新密碼至少需要 12 個字元。");
      return;
    }
    if (password !== confirmation) {
      setError("兩次輸入的密碼不一致。");
      return;
    }
    setSubmitting(true);
    try {
      const client = getSupabaseClient();
      await updateRecoveredPassword(client, password);
      await client.auth.signOut();
      navigate("/login", { replace: true, state: { passwordUpdated: true } });
    } catch {
      setError("密碼更新失敗；連結可能已失效，請重新申請復原信。");
    } finally {
      setPassword("");
      setConfirmation("");
      setSubmitting(false);
    }
  }

  if (state === "checking") return <LoadingState label="正在驗證密碼復原連結" />;
  if (state === "invalid") {
    return <main className="auth-page"><section className="auth-card"><div className="brand-mark" aria-hidden="true">邑</div><h1>復原連結無效</h1><p className="muted">此連結可能已失效或已使用。請重新申請密碼復原信。</p><Link className="button button--primary button-link" to="/forgot-password">重新申請</Link></section></main>;
  }

  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="new-password-heading">
      <div className="brand-mark" aria-hidden="true">邑</div>
      <div><p className="eyebrow">安全驗證完成</p><h1 id="new-password-heading">設定新密碼</h1><p className="muted">請使用至少 12 個字元且不與其他服務共用的密碼。</p></div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="new-password">新密碼</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />
        <label htmlFor="confirm-password">再次輸入新密碼</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? "更新中…" : "更新密碼"}</button>
      </form>
      <p className="security-note">新密碼只會直接送往 Supabase Auth，不會寫入本站資料庫或 log。</p>
    </section>
  </main>;
}
