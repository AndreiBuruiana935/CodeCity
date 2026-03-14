export interface GitHubFile {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  tree: GitHubFile[];
  truncated: boolean;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid GitHub repository URL");
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

function getToken(userToken?: string): string | undefined {
  return userToken || process.env.GITHUB_TOKEN || undefined;
}

function makeHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CodeCity-App",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers });

    if (res.status === 403) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const resetTime = res.headers.get("x-ratelimit-reset");

      if (remaining === "0" && resetTime) {
        const waitSec = Math.max(
          0,
          parseInt(resetTime) - Math.floor(Date.now() / 1000)
        );
        if (waitSec < 30 && attempt < retries) {
          // Wait for rate limit reset if it's soon
          await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
          continue;
        }
        throw new Error(
          `GitHub rate limit exceeded. Resets in ${waitSec}s. Add a GitHub token for 5000 req/hr instead of 60.`
        );
      }

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }

    return res;
  }
  throw new Error("GitHub API request failed after retries");
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  userToken?: string
): Promise<GitHubFile[]> {
  const token = getToken(userToken);
  const headers = makeHeaders(token);

  // Get default branch
  const repoRes = await fetchWithRetry(
    `https://api.github.com/repos/${owner}/${repo}`,
    headers
  );
  if (!repoRes.ok) {
    const body = await repoRes.text();
    if (repoRes.status === 403 && body.includes("rate limit")) {
      throw new Error(
        "GitHub rate limit exceeded. Add a GitHub personal access token to continue."
      );
    }
    throw new Error(
      `GitHub API error: ${repoRes.status} ${repoRes.statusText}`
    );
  }
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  // Get full tree recursively — this is a single API call
  const treeRes = await fetchWithRetry(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    headers
  );
  if (!treeRes.ok) {
    throw new Error(`GitHub tree API error: ${treeRes.status}`);
  }
  const treeData: GitHubTreeResponse = await treeRes.json();

  return treeData.tree.filter((f) => f.type === "blob");
}

/**
 * Fetch file content using the Git Blob API (base64 encoded).
 * This is more rate-limit-friendly than the Contents API.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  sha: string,
  userToken?: string
): Promise<string | null> {
  const token = getToken(userToken);
  const headers = makeHeaders(token);
  headers.Accept = "application/vnd.github.v3+json";

  try {
    const res = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`,
      headers,
      1
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (data.encoding === "base64" && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    if (data.content) return data.content;
    return null;
  } catch {
    return null;
  }
}

/**
 * Check remaining rate limit.
 */
export async function checkRateLimit(
  userToken?: string
): Promise<{ remaining: number; limit: number; reset: number }> {
  const token = getToken(userToken);
  const headers = makeHeaders(token);

  try {
    const res = await fetch("https://api.github.com/rate_limit", { headers });
    const data = await res.json();
    return {
      remaining: data.rate?.remaining ?? 0,
      limit: data.rate?.limit ?? 60,
      reset: data.rate?.reset ?? 0,
    };
  } catch {
    return { remaining: 0, limit: 60, reset: 0 };
  }
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib",
  ".pyc", ".class", ".o", ".obj",
  ".lock",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt",
  ".rb", ".php", ".cs", ".cpp", ".c", ".h",
  ".swift", ".dart", ".scala", ".ex", ".exs",
  ".vue", ".svelte",
]);

export function isBinaryFile(path: string): boolean {
  const ext = getExt(path);
  return BINARY_EXTENSIONS.has(ext);
}

export function isCodeFile(path: string): boolean {
  const ext = getExt(path);
  return CODE_EXTENSIONS.has(ext);
}

function getExt(path: string): string {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return "";
  return path.substring(lastDot).toLowerCase();
}
