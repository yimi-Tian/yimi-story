import { createClient } from "npm:@supabase/supabase-js@^2.95.0";
import settings from "../../../config/content-settings.json" with { type: "json" };
import { PUBLICATION_SCHEMA_VERSION, validatePublicationPreparation } from "../../../tools/publication/final-validation.mjs";
import { DEFAULT_LOCAL_ADMIN_ORIGIN } from "../_shared/cors.ts";
import { createPreparePublicationSnapshotHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = Deno.env.get("ADMIN_ALLOWED_ORIGIN") ?? DEFAULT_LOCAL_ADMIN_ORIGIN;
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(createPreparePublicationSnapshotHandler(allowedOrigin, {
  async verify(token) {
    const { data, error } = await service.auth.getUser(token);
    if (error || !data.user) return { status: "invalid" };
    const { data: admin, error: adminError } = await service.from("admin_users").select("is_active").eq("user_id", data.user.id).maybeSingle();
    if (adminError) throw new Error("admin_lookup_failed");
    return admin ? { status: admin.is_active ? "active" : "inactive", userId: data.user.id } : { status: "not_admin" };
  },
  async prepare(input, userId) {
    const { data: draft, error } = await service.from("content_drafts")
      .select("id,content_id,revision,status,data,validation_result,created_by")
      .eq("id", input.draftId).eq("created_by", userId).single();
    if (error || !draft) throw new Error("draft_not_manageable");
    if (draft.revision !== input.expectedRevision) throw new Error("stale_revision");
    const { data: item, error: itemError } = await service.from("content_items")
      .select("content_type,published_snapshot_id").eq("id", draft.content_id).single();
    if (itemError || !item) throw new Error("content_not_found");
    const { data: media, error: mediaError } = await service.from("media_assets")
      .select("id,content_id,draft_id,source,role,sort_order,legacy_path,legacy_asset_key,bucket,object_path,sha256,alt_text,rights_status,contains_portrait,upload_status,original_media_id,deleted_at,created_by")
      .eq("content_id", draft.content_id).is("deleted_at", null);
    if (mediaError) throw new Error("media_lookup_failed");
    const mapped = (media ?? []).map((asset) => ({
      id: asset.id, contentId: asset.content_id, draftId: asset.draft_id, createdBy: asset.created_by,
      source: asset.source, role: asset.role, sortOrder: asset.sort_order,
      legacyPath: asset.legacy_path, legacyAssetKey: asset.legacy_asset_key,
      bucket: asset.bucket, objectPath: asset.object_path, sha256: asset.sha256,
      altText: asset.alt_text, rightsStatus: asset.rights_status,
      containsPortrait: asset.contains_portrait, uploadStatus: asset.upload_status,
      originalMediaId: asset.original_media_id, deletedAt: asset.deleted_at,
    }));
    return validatePublicationPreparation({
      contentType: item.content_type,
      data: draft.data,
      revision: draft.revision,
      draftStatus: draft.status,
      draftValidation: draft.validation_result,
      media: mapped,
      settings,
      legacy: Boolean(item.published_snapshot_id),
      contentId: draft.content_id,
      draftId: draft.id,
      userId,
      async verifyStorage(asset) {
        if (asset.source !== "cms_draft") return { exists: true, sha256: null };
        const { data: blob, error: downloadError } = await service.storage.from("cms-drafts").download(asset.objectPath);
        if (downloadError || !blob) return { exists: false, sha256: null };
        return { exists: true, sha256: await sha256(blob) };
      },
    });
  },
  async create(input, userId, preparation) {
    const { data, error } = await service.rpc("prepare_publication_snapshot", {
      p_actor_id: userId,
      p_draft_id: input.draftId,
      p_expected_revision: input.expectedRevision,
      p_schema_version: PUBLICATION_SCHEMA_VERSION,
      p_public_data: preparation.publicData,
      p_media_manifest: preparation.mediaManifest,
      p_publication_validation: preparation.validation,
      p_expected_checksum: preparation.checksum,
    });
    if (error || !data) throw new Error(error?.message ?? "snapshot_create_failed");
    const snapshot = Array.isArray(data) ? data[0] : data;
    return {
      created_at: snapshot.created_at,
      source_revision: snapshot.source_revision,
      checksum_sha256: snapshot.checksum_sha256,
      status: snapshot.status,
    };
  },
}));
