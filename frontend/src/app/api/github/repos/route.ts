import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

type GitHubRepo = {
  id: number;
  full_name: string;
  html_url: string;
  private: boolean;
  owner: {
    login: string;
  };
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
  updated_at: string;
};

export async function GET(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });
  const accessToken = (token as { accessToken?: string } | null)?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const pages = [1, 2];
    const responses = await Promise.all(
      pages.map((page) =>
        fetch(
          `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
          { headers, cache: "no-store" }
        )
      )
    );

    const firstFailure = responses.find((res) => !res.ok);
    if (firstFailure) {
      const body = await firstFailure.text();
      return NextResponse.json(
        {
          error: `GitHub API error (${firstFailure.status}): ${body}`,
        },
        { status: 502 }
      );
    }

    const allPages = (await Promise.all(
      responses.map((res) => res.json())
    )) as GitHubRepo[][];

    const merged = allPages.flat();
    const deduped = Object.values(
      merged.reduce<Record<string, GitHubRepo>>((acc, repo) => {
        acc[repo.full_name] = repo;
        return acc;
      }, {})
    );

    const repos = deduped
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      .map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.full_name.split("/")[1],
        url: repo.html_url,
        private: repo.private,
        role: repo.permissions?.admin
          ? "admin"
          : repo.permissions?.push
          ? "write"
          : "read",
        updatedAt: repo.updated_at,
      }));

    return NextResponse.json({ repos });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch repositories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
