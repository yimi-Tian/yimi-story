import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalContent, ContentType, DraftStatus, ValidationResult } from "../content/content-contracts";

export interface ContentListItem {
  contentId: string;
  contentType: ContentType;
  publicId: string;
  publishedSnapshotId: string | null;
  publishedAt: string | null;
  draftId: string | null;
  draftStatus: DraftStatus | null;
  revision: number | null;
  updatedAt: string;
  mediaCount: number;
  data: CanonicalContent;
}
export interface ContentDraftRecord extends ContentListItem {
  validationResult: ValidationResult;
}

type RawObject = Record<string, unknown>;

function firstObject(value: unknown): RawObject | null {
  if (Array.isArray(value)) return (value[0] as RawObject | undefined) ?? null;
  return value && typeof value === "object" ? value as RawObject : null;
}

function toListItem(row: RawObject): ContentListItem {
  const draft = firstObject(row.drafts);
  const published = firstObject(row.published);
  const media = Array.isArray(row.media) ? row.media : [];
  const data = (draft?.data ?? published?.snapshot_data ?? {}) as CanonicalContent;
  return {
    contentId: String(row.id),
    contentType: row.content_type as ContentType,
    publicId: String(row.public_id),
    publishedSnapshotId: row.published_snapshot_id ? String(row.published_snapshot_id) : null,
    publishedAt: published?.created_at ? String(published.created_at) : null,
    draftId: draft?.id ? String(draft.id) : null,
    draftStatus: draft?.status ? draft.status as DraftStatus : null,
    revision: typeof draft?.revision === "number" ? draft.revision : null,
    updatedAt: String(draft?.updated_at ?? row.updated_at),
    mediaCount: media.length,
    data,
  };
}

const CONTENT_SELECT = `
  id,
  content_type,
  public_id,
  published_snapshot_id,
  updated_at,
  drafts:content_drafts(id, revision, status, data, validation_result, updated_at),
  published:publication_snapshots!content_items_published_snapshot_id_fkey(id, snapshot_data, created_at),
  media:media_assets(id)
`;

function fail(code: string): never {
  throw new Error(code);
}

export async function fetchContentList(client: SupabaseClient, type: ContentType): Promise<ContentListItem[]> {
  const { data, error } = await client.from("content_items").select(CONTENT_SELECT)
    .eq("content_type", type).order("public_id", { ascending: false });
  if (error) fail("CONTENT_LIST_FAILED");
  return ((data ?? []) as unknown as RawObject[]).map(toListItem);
}

async function fetchOne(client: SupabaseClient, type: ContentType, publicId: string): Promise<ContentDraftRecord> {
  const { data, error } = await client.from("content_items").select(CONTENT_SELECT)
    .eq("content_type", type).eq("public_id", publicId).single();
  if (error || !data) fail("CONTENT_READ_FAILED");
  const raw = data as unknown as RawObject;
  const item = toListItem(raw);
  const draft = firstObject(raw.drafts);
  return {
    ...item,
    validationResult: (draft?.validation_result ?? { valid: false, errors: [], warnings: [] }) as ValidationResult,
  };
}

export async function openContentDraft(client: SupabaseClient, type: ContentType, publicId: string): Promise<ContentDraftRecord> {
  let item = await fetchOne(client, type, publicId);
  if (item.draftId) return item;
  const { error } = await client.rpc("get_or_create_content_draft", { p_content_id: item.contentId });
  if (error) fail("DRAFT_CREATE_FAILED");
  item = await fetchOne(client, type, publicId);
  if (!item.draftId || item.revision !== 1) fail("DRAFT_CREATE_FAILED");
  return item;
}

export async function suggestNextPublicId(client: SupabaseClient, type: ContentType, year: number): Promise<string> {
  const { data, error } = await client.from("content_items").select("public_id").eq("content_type", type);
  if (error) fail("CONTENT_ID_PREVIEW_FAILED");
  const prefix = type === "class_result" ? `CR-${year}-` : `${year}-`;
  const highest = (data ?? []).reduce((maximum, row) => {
    const value = String(row.public_id);
    const sequence = value.startsWith(prefix) ? Number(value.slice(prefix.length)) : 0;
    return Number.isInteger(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export async function createContentDraft(
  client: SupabaseClient,
  type: ContentType,
  year: number,
  data: CanonicalContent,
  validationResult: ValidationResult,
): Promise<ContentDraftRecord> {
  const { data: created, error } = await client.rpc("create_content_with_draft", {
    p_content_type: type,
    p_year: year,
    p_data: data,
    p_validation_result: validationResult,
  });
  const result = Array.isArray(created) ? created[0] : created;
  if (error || !result?.public_id) fail("CONTENT_CREATE_FAILED");
  return fetchOne(client, type, String(result.public_id));
}

export async function saveContentDraft(
  client: SupabaseClient,
  draftId: string,
  data: CanonicalContent,
  validationResult: ValidationResult,
  status: DraftStatus,
): Promise<{ revision: number; status: DraftStatus; updatedAt: string }> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) fail("AUTH_REQUIRED");
  const { data: saved, error } = await client.from("content_drafts")
    .update({ data, validation_result: validationResult, status, updated_by: authData.user.id })
    .eq("id", draftId).select("revision, status, updated_at").single();
  if (error || !saved) fail("DRAFT_SAVE_FAILED");
  return { revision: saved.revision, status: saved.status as DraftStatus, updatedAt: saved.updated_at };
}
