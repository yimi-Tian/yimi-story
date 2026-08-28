import { validateActivity } from "../content/validate-activity.mjs";
import { validateClassResult } from "../content/validate-class-result.mjs";
import { projectActivityPublicData, projectClassResultPublicData } from "../content/public-projection.mjs";

export const PUBLICATION_SCHEMA_VERSION = "1.0";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stablePublicationStringify(value) {
  return JSON.stringify(canonicalize(value));
}

const INTERNAL_ONLY_FIELDS = new Set(["internalNotes"]);

export function findInternalOnlyFieldPaths(value, path = "$") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findInternalOnlyFieldPaths(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    return [
      ...(INTERNAL_ONLY_FIELDS.has(key) ? [childPath] : []),
      ...findInternalOnlyFieldPaths(child, childPath),
    ];
  });
}

export function buildPublicationExportDryRun({ contentType, publicData, mediaManifest }) {
  const payload = { contentType, data: publicData, media: mediaManifest };
  const internalOnlyPaths = findInternalOnlyFieldPaths(payload);
  return {
    safe: internalOnlyPaths.length === 0,
    internalOnlyPaths,
    text: stablePublicationStringify(payload),
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function publicationSnapshotChecksum({ schemaVersion = PUBLICATION_SCHEMA_VERSION, publicData, mediaManifest, sourceRevision }) {
  return sha256(stablePublicationStringify({ mediaManifest, publicData, schemaVersion, sourceRevision }));
}

function issue(field, code, message) { return { field, code, message }; }
function mediaReference(media, reference, role) {
  return media.find((asset) => asset.role === role && (asset.id === reference || asset.legacyAssetKey === reference));
}

function buildManifestEntry(asset, sortOrder) {
  return {
    id: asset.legacyAssetKey || asset.id,
    mediaId: asset.id,
    role: asset.role,
    sortOrder,
    source: asset.source,
    sha256: asset.sha256 ?? null,
    legacyPath: asset.legacyPath ?? null,
    bucket: asset.bucket ?? null,
    objectPath: asset.objectPath ?? null,
    originalMediaId: asset.originalMediaId ?? null,
  };
}

export async function validatePublicationPreparation({
  contentType,
  data,
  revision,
  draftStatus,
  draftValidation,
  media,
  settings,
  legacy = false,
  verifyStorage = async () => ({ exists: true, sha256: null }),
  contentId = null,
  draftId = null,
  userId = null,
}) {
  const canonical = contentType === "class_result"
    ? validateClassResult(data, { settings, legacyImport: legacy })
    : validateActivity(data, { settings, legacyImport: legacy });
  const errors = [...canonical.errors];
  const warnings = [...canonical.warnings];

  if (draftStatus !== "validated") errors.push(issue("status", "draft_not_validated", "草稿必須先通過內容檢查。"));
  if (!draftValidation?.valid || (draftValidation.errors?.length ?? 0) > 0) {
    errors.push(issue("validation", "stale_draft_validation", "草稿內容檢查不是目前可發布狀態。"));
  }

  const publicData = contentType === "class_result"
    ? projectClassResultPublicData(data)
    : projectActivityPublicData(data);
  const publicText = stablePublicationStringify(publicData);
  if (findInternalOnlyFieldPaths(publicData).length > 0) {
    errors.push(issue("internalNotes", "internal_notes_leak", "內部備註不得進入公開投影。"));
  }
  if (/<script\b|javascript:/i.test(publicText)) {
    errors.push(issue("publicData", "unsafe_public_content", "公開內容含有不安全的 script 或 javascript URL。"));
  }

  const refs = [];
  if (publicData.coverAssetId) refs.push({ reference: publicData.coverAssetId, role: "cover", order: 0 });
  publicData.galleryAssetIds.forEach((reference, index) => refs.push({ reference, role: "gallery", order: index + 1 }));
  if (!publicData.coverAssetId && !legacy) errors.push(issue("coverAssetId", "cover_required", "新內容必須設定封面圖片。"));

  const manifest = [];
  const seen = new Set();
  for (const ref of refs) {
    const asset = mediaReference(media, ref.reference, ref.role);
    if (!asset || asset.deletedAt) {
      errors.push(issue(ref.role === "cover" ? "coverAssetId" : "galleryAssetIds", "media_missing", "圖片參照不存在或已失效。"));
      continue;
    }
    if (seen.has(asset.id)) {
      errors.push(issue("galleryAssetIds", "media_duplicate", "圖片參照不可重複。"));
      continue;
    }
    seen.add(asset.id);
    if (asset.uploadStatus !== "ready" || !asset.sha256) {
      errors.push(issue("media", "media_not_ready", "圖片尚未完成驗證或缺少 checksum。"));
    }
    if (asset.source === "cms_draft") {
      if ((contentId && asset.contentId !== contentId) || (draftId && asset.draftId !== draftId) || (userId && asset.createdBy !== userId)) {
        errors.push(issue("media", "media_unauthorized", "草稿圖片不屬於目前內容、草稿或管理員。"));
      }
      if (!asset.bucket || !asset.objectPath || asset.bucket !== "cms-drafts") {
        errors.push(issue("media", "media_storage_invalid", "草稿圖片 Storage metadata 不完整。"));
      }
      if (!String(asset.altText ?? "").trim()) errors.push(issue("media.altText", "media_alt_required", "新上傳圖片必須填寫替代文字。"));
      if (!["owned", "authorized"].includes(asset.rightsStatus)) errors.push(issue("media.rightsStatus", "media_rights_unknown", "新上傳圖片必須確認權利狀態。"));
      if (typeof asset.containsPortrait !== "boolean") errors.push(issue("media.containsPortrait", "media_portrait_unknown", "新上傳圖片必須確認人物狀態。"));
      const storage = await verifyStorage(asset);
      if (!storage.exists) errors.push(issue("media", "storage_object_missing", "草稿圖片的 Storage object 不存在。"));
      else if (storage.sha256 && storage.sha256 !== asset.sha256) errors.push(issue("media", "storage_checksum_mismatch", "草稿圖片檔案與 metadata checksum 不一致。"));
    } else if (asset.source === "github_legacy") {
      if (!asset.legacyPath || !asset.legacyAssetKey) errors.push(issue("media", "legacy_media_invalid", "既有公開圖片 metadata 不完整。"));
      if (!String(asset.altText ?? "").trim()) warnings.push(issue("media.altText", "legacy_alt_missing", "既有公開圖片尚未補齊替代文字，本次依既有資料保留。"));
    } else {
      errors.push(issue("media", "media_source_invalid", "圖片來源不允許用於發布快照。"));
    }
    manifest.push(buildManifestEntry(asset, ref.order));
  }

  const exportResult = buildPublicationExportDryRun({ contentType, publicData, mediaManifest: manifest });
  const exportDryRun = exportResult.text;
  if (exportDryRun !== buildPublicationExportDryRun({ contentType, publicData, mediaManifest: manifest }).text) {
    errors.push(issue("export", "export_not_deterministic", "公開輸出無法穩定重建。"));
  }
  if (!exportResult.safe) errors.push(issue("export", "internal_notes_export_leak", "公開輸出包含內部欄位。"));

  const valid = errors.length === 0;
  const validation = {
    valid,
    revision,
    errors,
    warnings,
    mediaCount: manifest.length,
    coverReady: Boolean(publicData.coverAssetId || legacy),
    exporterDeterministic: true,
  };
  const checksum = await publicationSnapshotChecksum({ publicData, mediaManifest: manifest, sourceRevision: revision });
  return { valid, errors, warnings, publicData, mediaManifest: manifest, validation, checksum, exportDryRun };
}
