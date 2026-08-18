import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { resolvePublishedLocalImagePath } from "../content/validate-image-url.mjs";

function inspectPng(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("PNG 缺少 IHDR header");
  return { mimeType: "image/png", extension: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function inspectJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) break;
      return { mimeType: "image/jpeg", extension: "jpg", height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("JPEG 缺少可辨識的尺寸 header");
}

export async function readLegacyImageMetadata(siteRoot, legacyPath) {
  const relativePath = resolvePublishedLocalImagePath(legacyPath);
  if (!relativePath) throw new Error(`不是允許的既有相對圖片路徑：${legacyPath}`);
  const buffer = await readFile(resolve(siteRoot, relativePath));
  const inspected = inspectPng(buffer) || inspectJpeg(buffer);
  if (!inspected) throw new Error(`不支援或 header 無法辨識的圖片：${legacyPath}`);
  const sourceExtension = extname(relativePath).slice(1).toLowerCase();
  const compatible = inspected.mimeType === "image/jpeg" ? ["jpg", "jpeg"].includes(sourceExtension) : sourceExtension === inspected.extension;
  if (!compatible) throw new Error(`圖片副檔名與 header 不符：${legacyPath}`);
  if (!inspected.width || !inspected.height) throw new Error(`圖片尺寸無效：${legacyPath}`);
  return {
    originalFilename: basename(relativePath),
    mimeType: inspected.mimeType,
    extension: sourceExtension,
    byteSize: buffer.length,
    width: inspected.width,
    height: inspected.height,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
