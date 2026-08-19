import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getSupabaseClient } from "../lib/supabase";
import { requestPasswordRecovery } from "../auth/password-recovery";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFailed(false);
    try {
      await requestPasswordRecovery(getSupabaseClient(), email, window.location.origin);
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="recovery-heading">
      <div className="brand-mark" aria-hidden="true">邑</div>
      <div><p className="eyebrow">帳號協助</p><h1 id="recovery-heading">重設管理員密碼</h1><p className="muted">輸入管理員 Email，我們會寄送一次性密碼復原連結。</p></div>
      {sent ? <div className="notice notice--success" role="status"><strong>請檢查您的信箱</strong><span>若帳號存在，密碼復原信已寄出。請從信件連結返回本站設定新密碼。</span></div>
        : <form onSubmit={handleSubmit}>
          <label htmlFor="recovery-email">Email</label>
          <input id="recovery-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          {failed && <div className="form-error" role="alert">目前無法寄送復原信，請稍後再試。</div>}
          <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? "寄送中…" : "寄送復原信"}</button>
        </form>}
      <Link className="text-link" to="/login">返回登入</Link>
      <p className="security-note">為保護帳號安全，畫面不會顯示 Email 是否已註冊。</p>
    </section>
  </main>;
}
