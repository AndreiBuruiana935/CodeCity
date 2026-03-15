import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * GET /api/file-content?owner=X&repo=Y&path=Z
 *
 * Fetches a single file's source code from GitHub's Contents API.
 * Returns { content: string } or { error: string }.
 * Respects the user's GitHub OAuth token for rate limits.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const filePath = searchParams.get("path");

    if (!owner || !repo || !filePath) {
      return NextResponse.json(
        { error: "owner, repo, and path query params are required" },
        { status: 400 },
      );
    }

    // Get user's GitHub token from session if available
    const token = await getToken({ req, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET });
    const githubToken = (token?.accessToken as string) || undefined;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3.raw",
      "User-Agent": "CodeAtlas-App",
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`,
      { headers, signal: controller.signal },
    );

    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 403) {
        return NextResponse.json(
          { error: "GitHub rate limit reached. Sign in for higher limits." },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: `GitHub returned ${res.status}` },
        { status: res.status },
      );
    }

    // With Accept: raw header, GitHub returns raw file content directly
    const content = await res.text();

    // Cap at 200KB to stay within memory budget
    if (content.length > 200_000) {
      return NextResponse.json({
        content: content.slice(0, 200_000),
        truncated: true,
      });
    }

    return NextResponse.json({ content, truncated: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort")) {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
