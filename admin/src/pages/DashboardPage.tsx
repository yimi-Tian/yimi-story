import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { ErrorState, LoadingState } from "../components/States";
import { fetchDashboardCounts, type DashboardCounts } from "./dashboard-data";

const cards: Array<{ key: keyof DashboardCounts; label: string; note: string }> = [
  { key: "classResults", label: "班級花絮", note: "已發布成果" },
  { key: "activities", label: "活動成果", note: "已發布紀錄" },
  { key: "published", label: "已發布內容", note: "正式快照" },
  { key: "media", label: "圖片 metadata", note: "既有圖片參照" },
];

export function DashboardPage() {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchDashboardCounts(getSupabaseClient()).then((result) => { if (active) setCounts(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <>
    <div className="page-heading"><div><p className="eyebrow">Dashboard</p><h1>後台總覽</h1><p className="muted">目前正式發布內容的即時統計。</p></div><span className="status-chip"><i aria-hidden="true" />Cloud 已連線</span></div>
    {failed ? <ErrorState message="統計資料暫時無法載入，請稍後重新整理。" /> : !counts ? <LoadingState label="正在讀取正式內容統計" /> : <section className="metric-grid" aria-label="內容統計">{cards.map((card) => <article className="metric-card" key={card.key}><span>{card.label}</span><strong>{counts[card.key].toLocaleString("zh-TW")}</strong><small>{card.note}</small></article>)}</section>}
    <section className="coming-soon"><div><p className="eyebrow">Stage 5A</p><h2>內容管理功能建置中</h2><p>班級花絮、活動成果、媒體與發布流程將在後續階段逐步開放。</p></div><div className="progress-ring" aria-label="基礎架構已完成">基礎<br />完成</div></section>
  </>;
}
