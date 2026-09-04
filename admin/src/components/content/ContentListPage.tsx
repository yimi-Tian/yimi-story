import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { unpublishedContentState, type ContentType } from "../../content/content-contracts";
import { getSupabaseClient } from "../../lib/supabase";
import { ErrorState, LoadingState } from "../States";
import { contentStatusLabel, filterContentItems, type ContentFilters } from "../../data/content-list";
import { fetchContentList, type ContentListItem } from "../../data/content-repository";

const initialFilters: ContentFilters = { keyword: "", year: "", district: "", status: "all", activityType: "" };

export function ContentListPage({ type }: { type: ContentType }) {
  const [items, setItems] = useState<ContentListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const isClass = type === "class_result";
  const basePath = isClass ? "/class-results" : "/activities";

  useEffect(() => {
    let active = true;
    setFailed(false);
    void fetchContentList(getSupabaseClient(), type)
      .then((result) => { if (active) setItems(result); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [type]);

  const options = useMemo(() => {
    const rows = items ?? [];
    const values = (key: string) => [...new Set(rows.flatMap((item) => {
      const value = (item.data as unknown as Record<string, unknown>)[key];
      return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    }))].sort((a, b) => a.localeCompare(b, "zh-TW"));
    return { years: values("year").reverse(), districts: values("districts"), activityTypes: values("activityType") };
  }, [items]);
  const filtered = useMemo(() => filterContentItems(items ?? [], filters), [items, filters]);
  const updateFilter = (key: keyof ContentFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return <>
    <div className="page-heading"><div><p className="eyebrow">Content</p><h1>{isClass ? "班級花絮" : "活動成果"}</h1><p className="muted">查看正式基準與尚未發布的草稿內容。</p></div><Link className="button button--accent" to={`${basePath}/new`}>新增{isClass ? "班級花絮" : "活動成果"}</Link></div>
    {failed ? <ErrorState message="無法讀取內容，請確認網路連線與管理員權限。" /> : !items ? <LoadingState label="正在讀取內容" /> : <>
      <section className="filter-panel" aria-label="搜尋與篩選">
        <label>關鍵字<input value={filters.keyword} onChange={(event) => updateFilter("keyword", event.target.value)} placeholder={isClass ? "標題、課程、講師或 ID" : "名稱、帶領者、計畫、主題或 ID"} /></label>
        <label>年度<select value={filters.year} onChange={(event) => updateFilter("year", event.target.value)}><option value="">全部</option>{options.years.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>地區<select value={filters.district} onChange={(event) => updateFilter("district", event.target.value)}><option value="">全部</option>{options.districts.map((value) => <option key={value}>{value}</option>)}</select></label>
        {!isClass && <label>活動類型<select value={filters.activityType} onChange={(event) => updateFilter("activityType", event.target.value)}><option value="">全部</option>{options.activityTypes.map((value) => <option key={value}>{value}</option>)}</select></label>}
        <label>狀態<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="all">全部</option><option value="published">已發布</option><option value="draft">有草稿</option><option value="unpublished">未發布草稿</option><option value="published_with_draft">已發布・有未發布修改</option></select></label>
      </section>
      <p className="result-count">共 {filtered.length} 筆</p>
      <div className="table-scroll"><table className="content-table"><thead><tr>{isClass ? <><th>ID</th><th>標題／課程</th><th>講師</th><th>地區／場地</th><th>年度</th></> : <><th>ID</th><th>活動名稱／日期</th><th>類型／帶領者</th><th>地區／場地</th><th>參與人次</th></>}<th>狀態</th><th>最後更新</th><th /></tr></thead><tbody>{filtered.map((item) => {
        const data = item.data as unknown as Record<string, unknown>;
        const districts = Array.isArray(data.districts) ? data.districts.join("、") : "";
        return <tr key={item.contentId}>{isClass ? <><td><code>{item.publicId}</code></td><td><strong>{String(data.title ?? "")}</strong><small>{String(data.className ?? "")}</small></td><td>{String(data.instructor ?? "")}</td><td>{districts}<small>{String(data.venue ?? "")}</small></td><td>{String(data.year ?? "")}</td></> : <><td><code>{item.publicId}</code></td><td><strong>{String(data.name ?? "")}</strong><small>{String(data.dateLabel ?? "")}</small></td><td>{String(data.activityType ?? "")}<small>{String(data.leader ?? "")}</small></td><td>{districts}<small>{String(data.venue ?? "")}</small></td><td>{String(data.participants ?? "—")}</td></>}<td><span className={`record-status ${["changed", "unpublished"].includes(unpublishedContentState(item)) ? "has-draft" : ""}`}>{contentStatusLabel(item)}</span>{item.draftStatus === "validated" && <small>已檢查</small>}</td><td>{new Date(item.updatedAt).toLocaleString("zh-TW")}</td><td><Link className="text-link" to={`${basePath}/${encodeURIComponent(item.publicId)}`}>編輯</Link></td></tr>;
      })}</tbody></table></div>
    </>}
  </>;
}
