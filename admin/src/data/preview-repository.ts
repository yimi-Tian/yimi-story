import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityData } from "../../../src/content-types/activity";
import type { ClassResultData } from "../../../src/content-types/class-result";
// @ts-expect-error Stage 1 browser-safe public projection is shared with deterministic exporters.
import { projectActivityPublicData, projectClassResultPublicData, safePublicHttpsUrl } from "../../../tools/content/public-projection.mjs";
import { normalizeContentForm, validateCanonicalContent, type CanonicalContent, type ContentType, type DraftStatus, type ValidationResult } from "../content/content-contracts";
import { getMediaForContent, type DraftMediaAsset } from "./media-repository";
import type { DraftPreviewModel, PreviewImageModel, PublicActivityPreviewData, PublicClassPreviewData } from "../preview/preview-model";

type Raw = Record<string, unknown>;

const PREVIEW_SELECT = `
  id,
  content_type,
  public_id,
  published_snapshot_id,
  drafts:content_drafts(id, revision, status, data, validation_result, updated_at),
  published:publication_snapshots!content_items_published_snapshot_id_fkey(id, snapshot_data, created_at)
`;
const PUBLIC_SITE_BASE = "https://yimi-tian.github.io/yimi-story/";

function firstObject(value: unknown): Raw | null {
  if (Array.isArray(value)) return (value[0] as Raw | undefined) ?? null;
  return value && typeof value === "object" ? value as Raw : null;
}

function fail(code: string): never { throw new Error(code); }

function normalize(type: ContentType, raw: unknown): CanonicalContent {
  return normalizeContentForm(type as "class_result", raw as never);
}

function imageFor(referenceId: string | null, media: Map<string, DraftMediaAsset>, fallbackAlt: string): PreviewImageModel | null {
  if (!referenceId) return null;
  const asset = media.get(referenceId);
  return { url: safePublicHttpsUrl(asset?.previewUrl) ?? null, alt: asset?.altText.trim() || fallbackAlt };
}

function unavailableDraftCount(referenceIds: Array<string | null>, media: Map<string, DraftMediaAsset>): number {
  return [...new Set(referenceIds.filter((value): value is string => Boolean(value)))].filter((referenceId) => {
    const asset = media.get(referenceId);
    return asset?.source === "cms_draft" && !safePublicHttpsUrl(asset.previewUrl);
  }).length;
}

function legacyActivityHero(publicId: string, galleryFallback: PreviewImageModel | null): PreviewImageModel {
  return {
    url: new URL(`public/images/activities/${encodeURIComponent(publicId)}/cover.jpg`, PUBLIC_SITE_BASE).href,
    fallbackUrl: galleryFallback?.url ?? null,
    alt: "活動圖片",
  };
}

export function buildPreviewModel(input: {
  type: ContentType;
  publicId: string;
  publishedSnapshotId: string | null;
  draft: Raw | null;
  published: Raw | null;
  media: DraftMediaAsset[];
}): DraftPreviewModel {
  const sourceRow = input.draft ?? input.published;
  if (!sourceRow) fail("PREVIEW_NOT_FOUND");
  const rawData = input.draft ? sourceRow.data : sourceRow.snapshot_data;
  const canonical = normalize(input.type, rawData);
  const validation = input.draft
    ? (sourceRow.validation_result as ValidationResult ?? { valid: false, errors: [], warnings: [] })
    : validateCanonicalContent(input.type, canonical, true);
  const source = input.draft ? (input.publishedSnapshotId ? "draft" : "new_draft") : "published";
  const mediaMap = new Map(input.media.map((asset) => [asset.referenceId, asset]));
  const revision = input.draft && typeof sourceRow.revision === "number" ? sourceRow.revision : null;
  const draftStatus = input.draft && sourceRow.status ? sourceRow.status as DraftStatus : null;

  if (input.type === "class_result") {
    const data = projectClassResultPublicData(canonical as ClassResultData) as PublicClassPreviewData;
    const gallery = data.galleryAssetIds.map((id) => imageFor(id, mediaMap, "成果圖片") as PreviewImageModel);
    const explicitCover = imageFor(data.coverAssetId, mediaMap, "成果圖片");
    return {
      contentType: "class_result", publicId: input.publicId, source, revision, draftStatus, validation,
      data,
      cover: explicitCover ?? gallery[0] ?? null,
      heroSource: explicitCover ? "explicit" : gallery.length ? "gallery_fallback" : null,
      gallery,
      unavailableDraftImages: unavailableDraftCount([data.coverAssetId, ...data.galleryAssetIds], mediaMap),
    };
  }
  const data = projectActivityPublicData(canonical as ActivityData) as PublicActivityPreviewData;
  const gallery = data.galleryAssetIds.map((id) => imageFor(id, mediaMap, "活動圖片") as PreviewImageModel);
  const explicitCover = imageFor(data.coverAssetId, mediaMap, "活動圖片");
  const usesLegacyConvention = !explicitCover && Boolean(input.publishedSnapshotId);
  return {
    contentType: "activity", publicId: input.publicId, source, revision, draftStatus, validation,
    data,
    cover: explicitCover ?? (usesLegacyConvention ? legacyActivityHero(input.publicId, gallery[0] ?? null) : gallery[0] ?? null),
    heroSource: explicitCover ? "explicit" : usesLegacyConvention ? "legacy_convention" : gallery.length ? "gallery_fallback" : null,
    gallery,
    unavailableDraftImages: unavailableDraftCount([data.coverAssetId, ...data.galleryAssetIds], mediaMap),
  };
}

export async function getPreviewSource(client: SupabaseClient, type: ContentType, publicId: string): Promise<DraftPreviewModel> {
  const { data, error } = await client.from("content_items").select(PREVIEW_SELECT)
    .eq("content_type", type).eq("public_id", publicId).maybeSingle();
  if (error) fail("PREVIEW_READ_FAILED");
  if (!data) fail("PREVIEW_NOT_FOUND");
  const row = data as unknown as Raw;
  const draft = firstObject(row.drafts);
  const published = firstObject(row.published);
  if (!draft && !published) fail("PREVIEW_NOT_FOUND");
  const media = await getMediaForContent(client, String(row.id));
  return buildPreviewModel({
    type,
    publicId: String(row.public_id),
    publishedSnapshotId: row.published_snapshot_id ? String(row.published_snapshot_id) : null,
    draft,
    published,
    media,
  });
}
