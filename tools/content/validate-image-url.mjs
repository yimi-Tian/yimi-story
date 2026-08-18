import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addIssue, createValidationResult, normalizeText } from "./normalize-common.mjs";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function loadContentSettings(path = resolve(moduleRoot, "config/content-settings.json")) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function classifyImageReference(value) {
  const reference = normalizeText(value);
  if (!reference) return { kind: "empty", value: reference };
  if (/^[a-z][a-z\d+.-]*:/i.test(reference)) {
    try {
      return { kind: "url", value: reference, url: new URL(reference) };
    } catch {
      return { kind: "invalid", value: reference };
    }
  }
  return { kind: "relative", value: reference };
}

export function resolvePublishedLocalImagePath(reference) {
  const clean = reference.replace(/^\/+/, "");
  if (clean.startsWith("public/images/")) return clean;
  if (clean.startsWith("images/")) return `public/${clean}`;
  return null;
}

export async function validateImageReference(value, options = {}) {
  const result = createValidationResult();
  const settings = options.settings || await loadContentSettings(options.settingsPath);
  const classified = classifyImageReference(value);

  if (classified.kind === "empty") {
    addIssue(result, "errors", options.field || "image", "image.required", "圖片路徑不得為空。");
    return result;
  }
  if (classified.kind === "invalid") {
    addIssue(result, "errors", options.field || "image", "image.invalid", "圖片 URL 或路徑格式不正確。");
    return result;
  }

  if (classified.kind === "url") {
    const { url } = classified;
    if (url.protocol !== "https:") {
      addIssue(result, "errors", options.field || "image", "image.httpsOnly", "外部圖片只允許 HTTPS URL。");
      return result;
    }
    if (!(settings.allowedExternalImageHosts || []).includes(url.hostname)) {
      addIssue(result, "errors", options.field || "image", "image.hostNotAllowed", `外部圖片 host 未列入白名單：${url.hostname}`);
      return result;
    }
    if (!url.pathname.startsWith("/storage/v1/object/public/cms-public/")) {
      addIssue(result, "errors", options.field || "image", "image.publicBucketRequired", "Supabase 圖片必須位於 cms-public bucket。");
    }
    if (/\/sign\//i.test(url.pathname) || /(?:^|[?&])token=/i.test(url.search)) {
      addIssue(result, "errors", options.field || "image", "image.signedUrlForbidden", "正式輸出不得使用草稿 signed URL。");
    }
    return result;
  }

  const relativePath = resolvePublishedLocalImagePath(classified.value);
  if (!relativePath || relativePath.includes("..") || relativePath.includes("\\")) {
    addIssue(result, "errors", options.field || "image", "image.relativePath", "相對圖片必須位於 public/images/。");
    return result;
  }
  if (options.checkLocalFile) {
    const siteRoot = options.siteRoot || moduleRoot;
    let current = siteRoot;
    for (const segment of relativePath.split("/")) {
      const entries = await readdir(current);
      if (!entries.includes(segment)) {
        addIssue(result, "errors", options.field || "image", "image.notFound", `圖片不存在或大小寫不符：${classified.value}`);
        return result;
      }
      current = resolve(current, segment);
    }
  }
  return result;
}

export async function assertValidImageReference(value, options = {}) {
  const result = await validateImageReference(value, options);
  if (!result.valid) throw new Error(result.errors.map((issue) => issue.message).join("\n"));
  return value;
}
