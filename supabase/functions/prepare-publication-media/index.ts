import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import { DEFAULT_LOCAL_ADMIN_ORIGIN } from "../_shared/cors.ts";
import { createPreparePublicationMediaHandler, type MediaPreparationSummary } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN") ?? DEFAULT_LOCAL_ADMIN_ORIGIN;
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const decoder = new TextDecoder();

type ManifestEntry = {
  mediaId: string;
  role: "cover" | "gallery";
  sortOrder: number;
  source: "github_legacy" | "cms_draft";
  sha256: string | null;
  legacyPath: string | null;
  bucket: string | null;
  objectPath: string | null;
  mimeType: string | null;
  extension: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
};

class PromotionError extends Error {}
const fail = (code: string): never => { throw new PromotionError(code); };
function rowSummary(row: Record<string, unknown>): MediaPreparationSummary {
  return {
    status: String(row.status) as MediaPreparationSummary["status"],
    requiredCount: Number(row.required_count),
    promotedCount: Number(row.promoted_count),
    legacyCount: Number(row.legacy_count),
    failedCount: Number(row.failed_count),
    manifestChecksum: row.manifest_checksum_sha256 ? String(row.manifest_checksum_sha256) : null,
    errorCode: row.error_code ? String(row.error_code) : null,
  };
}
function validManifest(value: unknown): value is ManifestEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    const cms = item.source === "cms_draft";
    return typeof item.mediaId === "string"
      && ["cover", "gallery"].includes(String(item.role))
      && Number.isInteger(item.sortOrder) && Number(item.sortOrder) >= 0
      && ["github_legacy", "cms_draft"].includes(String(item.source))
      && (!cms || (
        typeof item.sha256 === "string" && /^[0-9a-f]{64}$/.test(item.sha256)
        && item.bucket === "cms-drafts"
        && typeof item.objectPath === "string" && item.objectPath.length > 0
        && ["image/jpeg", "image/png", "image/webp"].includes(String(item.mimeType))
        && ["jpg", "png", "webp"].includes(String(item.extension))
        && Number.isInteger(item.byteSize) && Number(item.byteSize) > 0
        && Number.isInteger(item.width) && Number(item.width) > 0
        && Number.isInteger(item.height) && Number(item.height) > 0
      ))
      && (cms || (typeof item.legacyPath === "string" && item.legacyPath.length > 0));
  });
}
function detect(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && decoder.decode(bytes.slice(0, 4)) === "RIFF" && decoder.decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
function dimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || decoder.decode(bytes.slice(12, 16)) !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 255) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 216 || marker === 217) { offset += 2; continue; }
      const length = bytes[offset + 2] << 8 | bytes[offset + 3];
      if (length < 2 || offset + length + 2 > bytes.length) return null;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        return { height: bytes[offset + 5] << 8 | bytes[offset + 6], width: bytes[offset + 7] << 8 | bytes[offset + 8] };
      }
      offset += length + 2;
    }
    return null;
  }
  if (bytes.length < 30) return null;
  const chunk = decoder.decode(bytes.slice(12, 16));
  if (chunk === "VP8X") return { width: (bytes[24] | bytes[25] << 8 | bytes[26] << 16) + 1, height: (bytes[27] | bytes[28] << 8 | bytes[29] << 16) + 1 };
  if (chunk === "VP8 ") return { width: (bytes[26] | bytes[27] << 8) & 16383, height: (bytes[28] | bytes[29] << 8) & 16383 };
  if (chunk === "VP8L" && bytes[20] === 47) {
    const bits = bytes[21] | bytes[22] << 8 | bytes[23] << 16 | bytes[24] << 24;
    return { width: (bits & 16383) + 1, height: ((bits >>> 14) & 16383) + 1 };
  }
  return null;
}
async function checksum(bytes: Uint8Array): Promise<string> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function verifyBytes(bytes: Uint8Array, entry: ManifestEntry, errorCode: string) {
  const mime = detect(bytes);
  const size = mime ? dimensions(bytes, mime) : null;
  const hash = await checksum(bytes);
  if (mime !== entry.mimeType || bytes.length !== entry.byteSize || size?.width !== entry.width || size?.height !== entry.height || hash !== entry.sha256) fail(errorCode);
  return hash;
}
function publicPath(contentId: string, entry: ManifestEntry): string {
  return `content/${contentId}/${entry.mediaId}/${entry.sha256}.${entry.extension}`;
}

Deno.serve(createPreparePublicationMediaHandler(allowedOrigin, {
  async verify(token) {
    const { data, error } = await service.auth.getUser(token);
    if (error || !data.user) return { status: "invalid" };
    const { data: admin, error: adminError } = await service.from("admin_users").select("is_active").eq("user_id", data.user.id).maybeSingle();
    if (adminError) throw new Error("admin_lookup_failed");
    return admin ? { status: admin.is_active ? "active" : "inactive", userId: data.user.id } : { status: "not_admin" };
  },
  async prepare(input, userId) {
    const { data: snapshot, error: snapshotError } = await service.from("publication_snapshots")
      .select("id,content_id,schema_version,media_manifest,checksum_sha256,status,snapshot_source,publication_validation")
      .eq("id", input.snapshotId).maybeSingle();
    if (snapshotError) fail("PROMOTION_FAILED");
    if (!snapshot) fail("SNAPSHOT_NOT_FOUND");
    if (snapshot.schema_version !== "1.1" || snapshot.snapshot_source !== "draft" || snapshot.status !== "ready" || snapshot.publication_validation?.valid !== true) fail("SNAPSHOT_NOT_READY");
    if (!validManifest(snapshot.media_manifest)) fail("SNAPSHOT_NOT_READY");
    const manifest = snapshot.media_manifest;
    const begun = await service.rpc("begin_publication_media_preparation", { p_actor_id: userId, p_snapshot_id: snapshot.id });
    if (begun.error || !begun.data) fail("PROMOTION_FAILED");
    const current = Array.isArray(begun.data) ? begun.data[0] : begun.data;
    if (current.status === "ready") return rowSummary(current);

    const uniqueDraft = [...new Map(manifest.filter((entry) => entry.source === "cms_draft").map((entry) => [entry.mediaId, entry])).values()];
    try {
      for (const entry of uniqueDraft) {
        const { data: source, error: sourceError } = await service.from("media_assets")
          .select("id,content_id,source,bucket,object_path,sha256,upload_status,deleted_at")
          .eq("id", entry.mediaId).maybeSingle();
        if (sourceError || !source || source.content_id !== snapshot.content_id || source.source !== "cms_draft" || source.bucket !== entry.bucket || source.object_path !== entry.objectPath || source.sha256 !== entry.sha256 || source.upload_status !== "ready" || source.deleted_at !== null) fail("SOURCE_MEDIA_MISSING");
        const downloaded = await service.storage.from(String(entry.bucket)).download(String(entry.objectPath));
        if (downloaded.error || !downloaded.data) fail("SOURCE_OBJECT_MISSING");
        const sourceBytes = new Uint8Array(await downloaded.data.arrayBuffer());
        await verifyBytes(sourceBytes, entry, "SOURCE_CHECKSUM_MISMATCH");

        const destination = publicPath(snapshot.content_id, entry);
        let createdThisAttempt = false;
        let publicDownload = await service.storage.from("cms-public").download(destination);
        if (publicDownload.error || !publicDownload.data) {
          const upload = await service.storage.from("cms-public").upload(destination, sourceBytes, { contentType: String(entry.mimeType), cacheControl: "31536000", upsert: false });
          if (!upload.error) createdThisAttempt = true;
          publicDownload = await service.storage.from("cms-public").download(destination);
          if (publicDownload.error || !publicDownload.data) fail("PROMOTION_FAILED");
        }
        const publicBytes = new Uint8Array(await publicDownload.data.arrayBuffer());
        try { await verifyBytes(publicBytes, entry, createdThisAttempt ? "PUBLIC_MEDIA_VERIFY_FAILED" : "DESTINATION_CONFLICT"); }
        catch (error) {
          if (createdThisAttempt) await service.storage.from("cms-public").remove([destination]).catch(() => undefined);
          throw error;
        }

        const registered = await service.rpc("register_publication_media_asset", {
          p_actor_id: userId,
          p_snapshot_id: snapshot.id,
          p_source_media_id: entry.mediaId,
          p_public_media_id: crypto.randomUUID(),
          p_public_object_path: destination,
          p_public_checksum_sha256: entry.sha256,
        });
        if (registered.error) {
          if (createdThisAttempt) {
            const existing = await service.from("media_assets").select("id").eq("source", "cms_public").eq("object_path", destination).maybeSingle();
            if (!existing.data) await service.storage.from("cms-public").remove([destination]).catch(() => undefined);
          }
          fail("PROMOTION_FAILED");
        }
      }
      const finalized = await service.rpc("finalize_publication_media_preparation", { p_actor_id: userId, p_snapshot_id: snapshot.id });
      if (finalized.error || !finalized.data) fail("PROMOTION_FAILED");
      return rowSummary(Array.isArray(finalized.data) ? finalized.data[0] : finalized.data);
    } catch (error) {
      const code = error instanceof PromotionError ? error.message : "PROMOTION_FAILED";
      try {
        await service.rpc("fail_publication_media_preparation", {
          p_actor_id: userId,
          p_snapshot_id: snapshot.id,
          p_error_code: code,
        });
      } catch {
        // Preserve the original stable promotion error when status persistence is unavailable.
      }
      throw new PromotionError(code);
    }
  },
}));
