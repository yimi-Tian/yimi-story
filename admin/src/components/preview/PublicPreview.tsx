import type { ActivityPreviewModel, ClassPreviewModel, DraftPreviewModel } from "../../preview/preview-model";
import { PreviewGallery } from "./PreviewGallery";
import { PreviewImage } from "./PreviewImage";

const Detail = ({ label, value }: { label: string; value: string | number | null | undefined }) => value === null || value === undefined || value === "" ? null : <div><dt>{label}</dt><dd>{value}</dd></div>;
const Chips = ({ values }: { values: string[] }) => values.length ? <div className="public-preview__chips">{values.map((value) => <span key={value}>{value}</span>)}</div> : null;
const Notes = ({ value }: { value: string | null }) => value ? <section className="public-preview__section"><h2>公開備註</h2><p>{value}</p></section> : null;

function ClassResultPreview({ model }: { model: ClassPreviewModel }) {
  const { data } = model;
  return <article className="public-preview" aria-label="班級花絮公開內容預覽">
    <header className="public-preview__head"><p>班級花絮與成果</p><h1>{data.title}</h1></header>
    <section className={`public-preview__hero ${model.cover ? "has-cover" : ""}`}>
      {model.cover && <PreviewImage image={model.cover} className="public-preview__cover" />}
      <dl><Detail label="課程名稱" value={data.className} /><Detail label="授課教師" value={data.instructor} /><Detail label="地區" value={data.districts.join("、")} /><Detail label="上課地點" value={data.venue} /></dl>
    </section>
    {data.description && <section className="public-preview__section"><h2>課程介紹</h2><p>{data.description}</p></section>}
    {data.tags.length > 0 && <section className="public-preview__section"><h2>標籤</h2><Chips values={data.tags} /></section>}
    {data.sdgs.length > 0 && <section className="public-preview__section"><h2>SDGs 對應</h2><Chips values={data.sdgs} /></section>}
    <Notes value={data.publicNotes} />
    <PreviewGallery images={model.gallery} title="花絮與成果照片" />
  </article>;
}

function ActivityPreview({ model }: { model: ActivityPreviewModel }) {
  const { data } = model;
  return <article className="public-preview" aria-label="活動成果公開內容預覽">
    <header className="public-preview__head"><p>{data.year} 年活動成果</p><h1>{data.name}</h1></header>
    <section className={`public-preview__hero ${model.cover ? "has-cover" : ""}`}>
      {model.cover && <PreviewImage image={model.cover} className="public-preview__cover" />}
      <dl><Detail label="活動日期" value={data.dateLabel} /><Detail label="地區" value={data.districts.join("、")} /><Detail label="活動地點" value={data.venue} /><Detail label="計畫名稱" value={data.projectName} /><Detail label="活動類型" value={data.activityType} /><Detail label="活動主題" value={data.topic} /><Detail label="參與人次" value={data.participants === null ? null : `${data.participants} 人次`} /><Detail label="合作單位" value={data.partnerOrganizations} /><Detail label="講師／帶領者" value={data.leader} /></dl>
    </section>
    {data.summary && <section className="public-preview__section"><h2>活動效益摘要</h2><p>{data.summary}</p></section>}
    {data.sdgs.length > 0 && <section className="public-preview__section"><h2>SDGs 對應</h2><Chips values={data.sdgs} /></section>}
    {data.keywords.length > 0 && <section className="public-preview__section"><h2>成果關鍵字</h2><Chips values={data.keywords} /></section>}
    <Notes value={data.publicNotes} />
    {(data.videoUrl || data.relatedUrl) && <section className="public-preview__section"><h2>相關連結</h2><div className="public-preview__links">{data.videoUrl && <a href={data.videoUrl} target="_blank" rel="noopener noreferrer">觀看影片</a>}{data.relatedUrl && <a href={data.relatedUrl} target="_blank" rel="noopener noreferrer">延伸連結</a>}</div></section>}
    <PreviewGallery images={model.gallery} title="成果照片牆" />
  </article>;
}

export function PublicPreview({ model }: { model: DraftPreviewModel }) {
  return model.contentType === "class_result" ? <ClassResultPreview model={model} /> : <ActivityPreview model={model} />;
}
