import { FORMAL_FILE_ALLOWLIST, sha256Hex, type FormalFilePath } from "./formal-publication.ts";

export const GITHUB_OWNER = "yimi-Tian";
export const GITHUB_REPOSITORY = "yimi-story";
export const GITHUB_BASE_BRANCH = "main";
export const PUBLIC_SITE_BASE_URL = "https://yimi-tian.github.io/yimi-story";
const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export class GitHubPublicationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

type Fetch = typeof fetch;
type Credentials = { appId: string; installationId: string; privateKey: string; owner: string; repository: string };

function fail(code: string): never {
  throw new GitHubPublicationError(code);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let value = length; value > 0; value >>>= 8) bytes.unshift(value & 0xff);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, value: Uint8Array): Uint8Array {
  const length = derLength(value.length);
  const output = new Uint8Array(1 + length.length + value.length);
  output[0] = tag;
  output.set(length, 1);
  output.set(value, 1 + length.length);
  return output;
}

function concat(...values: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function decodePrivateKey(value: string): Uint8Array {
  const pem = value.replaceAll("\\n", "\n").trim();
  const pkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const body = pem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/u, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/u, "").replace(/\s+/gu, "");
  if (!body) fail("GITHUB_CONFIGURATION_MISSING");
  let decoded: Uint8Array;
  try {
    decoded = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
  } catch {
    fail("GITHUB_CONFIGURATION_INVALID");
  }
  if (!pkcs1) return decoded;
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  return der(0x30, concat(version, algorithm, der(0x04, decoded)));
}

export async function createAppJwt(appId: string, privateKey: string, now = Date.now()): Promise<string> {
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      decodePrivateKey(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const seconds = Math.floor(now / 1000);
    const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({ iat: seconds - 60, exp: seconds + 540, iss: appId })}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
    return `${unsigned}.${encodeBase64Url(new Uint8Array(signature))}`;
  } catch (error) {
    if (error instanceof GitHubPublicationError) throw error;
    fail("GITHUB_JWT_FAILED");
  }
}

export function githubCredentialsFromEnv(): Credentials {
  const credentials = {
    appId: Deno.env.get("GITHUB_APP_ID")?.trim() ?? "",
    installationId: Deno.env.get("GITHUB_APP_INSTALLATION_ID")?.trim() ?? "",
    privateKey: Deno.env.get("GITHUB_APP_PRIVATE_KEY") ?? "",
    owner: Deno.env.get("GITHUB_REPOSITORY_OWNER")?.trim() ?? "",
    repository: Deno.env.get("GITHUB_REPOSITORY_NAME")?.trim() ?? "",
  };
  if (!credentials.appId || !credentials.installationId || !credentials.privateKey || !credentials.owner || !credentials.repository) {
    fail("GITHUB_CONFIGURATION_MISSING");
  }
  if (credentials.owner !== GITHUB_OWNER || credentials.repository !== GITHUB_REPOSITORY) fail("REPOSITORY_MISMATCH");
  return credentials;
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Utf8(value: string): string {
  const binary = atob(value.replace(/\s+/gu, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function safeBranch(value: string): string {
  if (!/^publication\/(?:class-result|activity)\/[A-Za-z0-9._-]+\/[0-9a-f]{12}$/u.test(value)) fail("BRANCH_NAME_INVALID");
  return value;
}

export function publicationBranchName(contentType: "class_result" | "activity", publicId: string, checksum: string): string {
  const cleanId = publicId.replace(/[^A-Za-z0-9._-]/gu, "-");
  if (!cleanId || !/^[0-9a-f]{64}$/u.test(checksum)) fail("BRANCH_NAME_INVALID");
  return safeBranch(`publication/${contentType === "class_result" ? "class-result" : "activity"}/${cleanId}/${checksum.slice(0, 12)}`);
}

export class GitHubPublicationClient {
  private token: string | null = null;
  private readonly credentials: Credentials;
  private readonly fetcher: Fetch;

  constructor(credentials: Credentials, fetcher: Fetch = fetch) {
    this.credentials = credentials;
    this.fetcher = fetcher;
    if (credentials.owner !== GITHUB_OWNER || credentials.repository !== GITHUB_REPOSITORY) fail("REPOSITORY_MISMATCH");
  }

  private async request(
    path: string,
    options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; bearer?: string; allow404?: boolean; code?: string } = {},
  ): Promise<Record<string, unknown> | null> {
    const bearer = options.bearer ?? await this.installationToken();
    const response = await this.fetcher(`${GITHUB_API}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${bearer}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (options.allow404 && response.status === 404) return null;
    if (!response.ok) fail(options.code ?? "GITHUB_API_FAILED");
    if (response.status === 204) return {};
    return await response.json() as Record<string, unknown>;
  }

  private async installationToken(): Promise<string> {
    if (this.token) return this.token;
    const jwt = await createAppJwt(this.credentials.appId, this.credentials.privateKey);
    const result = await this.request(
      `/app/installations/${encodeURIComponent(this.credentials.installationId)}/access_tokens`,
      { method: "POST", bearer: jwt, code: "GITHUB_INSTALLATION_TOKEN_FAILED" },
    );
    if (!result || typeof result.token !== "string") fail("GITHUB_INSTALLATION_TOKEN_FAILED");
    this.token = result.token;
    return this.token;
  }

  async getRepository(): Promise<{ owner: string; name: string; defaultBranch: string }> {
    const result = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}`, { code: "REPOSITORY_READ_FAILED" });
    const owner = String((result?.owner as Record<string, unknown> | undefined)?.login ?? "");
    const name = String(result?.name ?? "");
    const defaultBranch = String(result?.default_branch ?? "");
    if (owner !== GITHUB_OWNER || name !== GITHUB_REPOSITORY || defaultBranch !== GITHUB_BASE_BRANCH) fail("REPOSITORY_MISMATCH");
    return { owner, name, defaultBranch };
  }

  async getDefaultBranchRef(): Promise<string> {
    const result = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/ref/heads/${GITHUB_BASE_BRANCH}`, { code: "MAIN_READ_FAILED" });
    const sha = String((result?.object as Record<string, unknown> | undefined)?.sha ?? "");
    if (!/^[0-9a-f]{40}$/u.test(sha)) fail("MAIN_READ_FAILED");
    return sha;
  }

  async readFile(path: FormalFilePath, ref = GITHUB_BASE_BRANCH): Promise<{ path: FormalFilePath; text: string; blobSha: string; byteSize: number }> {
    if (!FORMAL_FILE_ALLOWLIST.includes(path)) fail("FORMAL_PATH_FORBIDDEN");
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const result = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/contents/${encoded}?ref=${encodeURIComponent(ref)}`, { code: "FORMAL_FILE_READ_FAILED" });
    if (result?.type !== "file" || typeof result.content !== "string" || typeof result.sha !== "string") fail("FORMAL_FILE_READ_FAILED");
    const text = base64Utf8(result.content);
    const byteSize = new TextEncoder().encode(text).length;
    if (byteSize !== Number(result.size)) fail("FORMAL_FILE_READ_FAILED");
    return { path, text, blobSha: result.sha, byteSize };
  }

  async readFormalFiles(ref = GITHUB_BASE_BRANCH): Promise<Record<FormalFilePath, string>> {
    const entries = await Promise.all(FORMAL_FILE_ALLOWLIST.map((path) => this.readFile(path, ref)));
    return Object.fromEntries(entries.map((entry) => [entry.path, entry.text])) as Record<FormalFilePath, string>;
  }

  async getBranchRef(branch: string): Promise<string | null> {
    const result = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/ref/heads/${safeBranch(branch)}`, { allow404: true, code: "BRANCH_READ_FAILED" });
    if (!result) return null;
    const sha = String((result.object as Record<string, unknown> | undefined)?.sha ?? "");
    return /^[0-9a-f]{40}$/u.test(sha) ? sha : fail("BRANCH_READ_FAILED");
  }

  async getCommit(sha: string): Promise<{ sha: string; treeSha: string }> {
    if (!/^[0-9a-f]{40}$/u.test(sha)) fail("COMMIT_READ_FAILED");
    const result = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/commits/${sha}`, { code: "COMMIT_READ_FAILED" });
    const treeSha = String((result?.tree as Record<string, unknown> | undefined)?.sha ?? "");
    if (!/^[0-9a-f]{40}$/u.test(treeSha)) fail("COMMIT_READ_FAILED");
    return { sha: String(result?.sha ?? sha), treeSha };
  }

  async createCommitAndBranch(input: { branch: string; baseSha: string; message: string; files: Partial<Record<FormalFilePath, string>> }): Promise<string> {
    const branch = safeBranch(input.branch);
    if (await this.getBranchRef(branch)) fail("BRANCH_CONFLICT");
    const paths = Object.keys(input.files) as FormalFilePath[];
    if (!paths.length || paths.some((path) => !FORMAL_FILE_ALLOWLIST.includes(path))) fail("FORMAL_PATH_FORBIDDEN");
    const base = await this.getCommit(input.baseSha);
    const treeEntries = [];
    for (const path of paths.sort()) {
      const blob = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/blobs`, {
        method: "POST", body: { content: utf8Base64(input.files[path]!), encoding: "base64" }, code: "COMMIT_CREATE_FAILED",
      });
      if (!blob || typeof blob.sha !== "string") fail("COMMIT_CREATE_FAILED");
      treeEntries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/trees`, {
      method: "POST", body: { base_tree: base.treeSha, tree: treeEntries }, code: "COMMIT_CREATE_FAILED",
    });
    const commit = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/commits`, {
      method: "POST", body: { message: input.message, tree: tree?.sha, parents: [input.baseSha] }, code: "COMMIT_CREATE_FAILED",
    });
    const commitSha = String(commit?.sha ?? "");
    if (!/^[0-9a-f]{40}$/u.test(commitSha)) fail("COMMIT_CREATE_FAILED");
    await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/refs`, {
      method: "POST", body: { ref: `refs/heads/${branch}`, sha: commitSha }, code: "BRANCH_CREATE_FAILED",
    });
    return commitSha;
  }

  async createDraftPullRequest(input: { branch: string; title: string; body: string }): Promise<{ number: number; url: string }> {
    const result = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/pulls`, {
      method: "POST",
      body: { title: input.title, body: input.body, head: safeBranch(input.branch), base: GITHUB_BASE_BRANCH, draft: true },
      code: "PULL_REQUEST_CREATE_FAILED",
    });
    const number = Number(result?.number);
    const url = String(result?.html_url ?? "");
    if (!Number.isInteger(number) || number < 1 || url !== `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/pull/${number}`) fail("PULL_REQUEST_CREATE_FAILED");
    return { number, url };
  }

  async findPullRequest(branch: string): Promise<{ number: number; url: string; state: string } | null> {
    const result = await this.request(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/pulls?state=all&head=${encodeURIComponent(`${GITHUB_OWNER}:${safeBranch(branch)}`)}`,
      { code: "PULL_REQUEST_READ_FAILED" },
    );
    if (!Array.isArray(result)) fail("PULL_REQUEST_READ_FAILED");
    const item = result[0] as Record<string, unknown> | undefined;
    if (!item) return null;
    const number = Number(item.number);
    const url = String(item.html_url ?? "");
    if (!Number.isInteger(number) || url !== `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/pull/${number}`) fail("PULL_REQUEST_READ_FAILED");
    return { number, url, state: String(item.state ?? "") };
  }

  async getPullRequest(number: number): Promise<{ state: string; draft: boolean; merged: boolean; mergeCommitSha: string | null; headSha: string }> {
    const result = await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/pulls/${number}`, { code: "PULL_REQUEST_READ_FAILED" });
    return {
      state: String(result?.state ?? ""),
      draft: result?.draft === true,
      merged: result?.merged === true,
      mergeCommitSha: typeof result?.merge_commit_sha === "string" ? result.merge_commit_sha : null,
      headSha: String((result?.head as Record<string, unknown> | undefined)?.sha ?? ""),
    };
  }

  async closePullRequest(number: number): Promise<void> {
    const current = await this.getPullRequest(number);
    if (current.merged) fail("PULL_REQUEST_ALREADY_MERGED");
    if (current.state !== "closed") {
      await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/pulls/${number}`, { method: "PATCH", body: { state: "closed" }, code: "PULL_REQUEST_CLOSE_FAILED" });
    }
  }

  async deletePublicationBranch(branch: string): Promise<void> {
    if (!await this.getBranchRef(branch)) return;
    await this.request(`/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/git/refs/heads/${safeBranch(branch)}`, { method: "DELETE", code: "BRANCH_DELETE_FAILED" });
  }

  async getPagesDeploymentStatus(files: Array<{ path: FormalFilePath; sha256: string }>): Promise<"deployed" | "pending" | "failed"> {
    for (const file of files) {
      const response = await this.fetcher(`${PUBLIC_SITE_BASE_URL}/${file.path}?publication-check=${encodeURIComponent(file.sha256.slice(0, 12))}`, { cache: "no-store" });
      if (response.status >= 500) return "failed";
      if (!response.ok || await sha256Hex(await response.text()) !== file.sha256) return "pending";
    }
    return "deployed";
  }
}
