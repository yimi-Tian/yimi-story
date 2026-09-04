import type { ContentListItem } from "./content-repository";
import { unpublishedContentState } from "../content/content-contracts";

export type ContentStatusFilter = "all" | "published" | "draft" | "unpublished" | "published_with_draft";

export function contentStatusLabel(item: ContentListItem): string {
  if (unpublishedContentState(item) === "changed") return "已發布・有未發布修改";
  if (unpublishedContentState(item) === "unknown") return "已發布・內容比對暫不可用";
  if (item.publishedSnapshotId) return "已發布";
  return "未發布草稿";
}

function statusMatches(item: ContentListItem, status: ContentStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "published") return unpublishedContentState(item) === "synced";
  if (status === "draft") return Boolean(item.draftId);
  if (status === "unpublished") return Boolean(!item.publishedSnapshotId && item.draftId);
  return unpublishedContentState(item) === "changed";
}

export interface ContentFilters {
  keyword: string;
  year: string;
  district: string;
  status: ContentStatusFilter;
  activityType?: string;
}

export function filterContentItems(items: ContentListItem[], filters: ContentFilters): ContentListItem[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase("zh-TW");
  return items.filter((item) => {
    const data = item.data as unknown as Record<string, unknown>;
    const searchable = item.contentType === "class_result"
      ? [item.publicId, data.title, data.className, data.instructor]
      : [item.publicId, data.name, data.leader, data.projectName, data.topic];
    const districts = Array.isArray(data.districts) ? data.districts.map(String) : [];
    return (!keyword || searchable.some((value) => String(value ?? "").toLocaleLowerCase("zh-TW").includes(keyword)))
      && (!filters.year || String(data.year) === filters.year)
      && (!filters.district || districts.includes(filters.district))
      && (!filters.activityType || String(data.activityType ?? "") === filters.activityType)
      && statusMatches(item, filters.status);
  });
}

export function downgradeValidatedAfterEdit(_status: "draft" | "validated"): "draft" {
  return "draft";
}
