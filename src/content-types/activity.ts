export type WalkingType =
  | "地方走讀"
  | "聚落踏查"
  | "流域觀察"
  | "生態觀察"
  | "訪談／口述"
  | "文史採集"
  | "產業地景"
  | "其他";

export type WalkingRecordStop = {
  name: string;
  note: string | null;
};

export type WalkingRecordExtension = {
  type: WalkingType;
  titleOverride: string | null;
  locationOverride: string | null;
  summary: string;
  routeSummary: string | null;
  stops: WalkingRecordStop[];
  fieldNotes: string[];
  digitalWalkId: string | null;
  coverAssetId: string | null;
};

export type ActivityData = {
  id: string;
  year: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  dateLabel: string;
  districts: string[];
  venue: string;
  projectName: string | null;
  activityType: string;
  topic: string;
  sdgs: string[];
  summary: string;
  participants: number | null;
  partnerOrganizations: string | null;
  leader: string | null;
  keywords: string[];
  videoUrl: string | null;
  relatedUrl: string | null;
  featured: boolean;
  internalNotes: string | null;
  publicNotes: string | null;
  coverAssetId: string | null;
  galleryAssetIds: string[];
  walkingRecord: WalkingRecordExtension | null;
};
