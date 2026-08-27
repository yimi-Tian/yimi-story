import type { ActivityData } from "../../../src/content-types/activity";
import type { ClassResultData } from "../../../src/content-types/class-result";
import type { DraftStatus, ValidationResult } from "../content/content-contracts";

export type PublicClassPreviewData = Omit<ClassResultData, "internalNotes">;
export type PublicActivityPreviewData = Omit<ActivityData, "internalNotes">;

export interface PreviewImageModel {
  url: string | null;
  alt: string;
  fallbackUrl?: string | null;
}

interface PreviewBase {
  publicId: string;
  source: "draft" | "new_draft" | "published";
  revision: number | null;
  draftStatus: DraftStatus | null;
  validation: ValidationResult;
  cover: PreviewImageModel | null;
  heroSource: "explicit" | "legacy_convention" | "gallery_fallback" | null;
  gallery: PreviewImageModel[];
  unavailableDraftImages: number;
}

export interface ClassPreviewModel extends PreviewBase {
  contentType: "class_result";
  data: PublicClassPreviewData;
}

export interface ActivityPreviewModel extends PreviewBase {
  contentType: "activity";
  data: PublicActivityPreviewData;
}

export type DraftPreviewModel = ClassPreviewModel | ActivityPreviewModel;
