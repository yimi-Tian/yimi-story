export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_DIMENSION = 12_000;
export const MIN_RECOMMENDED_DIMENSION = 300;
export const MAX_NEW_GALLERY_IMAGES = 20;

export type AllowedMediaType = "image/jpeg" | "image/png" | "image/webp";
export type PortraitStatus = "yes" | "no" | "unknown";
export type RightsStatus = "owned" | "authorized" | "unknown";

export interface ValidatedMediaFile {
  mimeType: AllowedMediaType;
  extension: "jpg" | "png" | "webp";
  byteSize: number;
  width: number;
  height: number;
  checksumSha256: string;
  warnings: string[];
}

const MIME_EXTENSION: Record<AllowedMediaType, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"],
};
const decoder = new TextDecoder();
const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

export function detectImageType(bytes: Uint8Array): AllowedMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 12 && decoder.decode(bytes.slice(0, 4)) === "RIFF" && decoder.decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

export function readImageDimensions(bytes: Uint8Array, mime: AllowedMediaType): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || decoder.decode(bytes.slice(12, 16)) !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + length + 2 > bytes.length) return null;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))
        return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
      offset += length + 2;
    }
    return null;
  }
  if (bytes.length < 30) return null;
  const chunk = decoder.decode(bytes.slice(12, 16));
  if (chunk === "VP8X") return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  if (chunk === "VP8 ") return { width: (bytes[26] | bytes[27] << 8) & 0x3fff, height: (bytes[28] | bytes[29] << 8) & 0x3fff };
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes[21] | bytes[22] << 8 | bytes[23] << 16 | bytes[24] << 24;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function safeStoragePath(userId: string, contentId: string, mediaId: string, extension: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![userId, contentId, mediaId].every((v) => uuid.test(v))) throw new Error("INVALID_STORAGE_SEGMENT");
  if (!/^(jpg|png|webp)$/.test(extension)) throw new Error("INVALID_MEDIA_EXTENSION");
  return `${userId}/${contentId}/${mediaId}/${mediaId}.${extension}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function validateMediaFile(file: File): Promise<ValidatedMediaFile> {
  if (file.size > MAX_MEDIA_BYTES) throw new Error("MEDIA_TOO_LARGE");
  if (!file.size) throw new Error("MEDIA_CORRUPT");
  const declared = file.type.toLowerCase() as AllowedMediaType;
  if (!(declared in MIME_EXTENSION)) throw new Error("MEDIA_TYPE_UNSUPPORTED");
  const extension = extensionOf(file.name);
  if (!MIME_EXTENSION[declared].includes(extension)) throw new Error("MEDIA_EXTENSION_MISMATCH");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected || detected !== declared) throw new Error("MEDIA_HEADER_MISMATCH");
  const dimensions = readImageDimensions(bytes, detected);
  if (!dimensions?.width || !dimensions.height) throw new Error("MEDIA_CORRUPT");
  if (dimensions.width > MAX_MEDIA_DIMENSION || dimensions.height > MAX_MEDIA_DIMENSION) throw new Error("MEDIA_DIMENSIONS_TOO_LARGE");
  return {
    mimeType: detected,
    extension: detected === "image/jpeg" ? "jpg" : detected === "image/png" ? "png" : "webp",
    byteSize: bytes.byteLength, width: dimensions.width, height: dimensions.height,
    checksumSha256: await sha256Hex(bytes),
    warnings: dimensions.width < MIN_RECOMMENDED_DIMENSION || dimensions.height < MIN_RECOMMENDED_DIMENSION ? ["圖片任一邊低於 300px，公開顯示時可能不夠清晰。"] : [],
  };
}

export function reorderAssetIds(ids: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
export const hasDuplicateChecksum = (assets: readonly { checksumSha256: string | null }[], checksum: string) => assets.some((a) => a.checksumSha256 === checksum);
export function findOrphanDraftMedia<T extends { id:string;source:string;referenceId:string;originalMediaId?:string|null }>(assets: readonly T[], coverAssetId: string | null, galleryAssetIds: readonly string[]): T[] {
  const referenced=new Set([...(coverAssetId?[coverAssetId]:[]),...galleryAssetIds]);
  const versionRoots=new Set(assets.flatMap((asset)=>asset.source==="cms_draft"&&asset.originalMediaId?[asset.originalMediaId]:[]));
  return assets.filter((asset)=>asset.source==="cms_draft"&&!referenced.has(asset.referenceId)&&!versionRoots.has(asset.id));
}
