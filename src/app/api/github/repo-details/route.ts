import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

type GitHubRepoDetails = {
  full_name: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  disabled: boolean;
  visibility: string;
  homepage: string | null;
  size: number;
  stargazers_count: number;
  subscribers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  license?: {
    name?: string;
  };
  topics?: string[];
  network_count: number;
  owner: {
    login: string;
  };
  created_at: string;
  updated_at: string;
  pushed_at: string;
  language: string | null;
};

type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: {
      name?: string;
      date?: string;
    };
  };
};

type GitHubTree = {
  tree?: Array<{ type: string }>;
};

type GitHubContributor = {
  login: string;
  html_url: string;
  contributions: number;
};

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const accessToken = (token as { accessToken?: string } | null)?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fullName = req.nextUrl.searchParams.get("fullName");
  if (!fullName || !/^[^/]+\/[^/]+$/.test(fullName)) {
    return NextResponse.json({ error: "Invalid fullName" }, { status: 400 });
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers,
      cache: "no-store",
    });

    if (!repoRes.ok) {
      const body = await repoRes.text();
      return NextResponse.json(
        { error: `GitHub repo API error (${repoRes.status}): ${body}` },
        { status: 502 }
      );
    }

    const repoData = (await repoRes.json()) as GitHubRepoDetails;

    const [commitRes, treeRes, contributorsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${fullName}/commits?per_page=1`, {
        headers,
        cache: "no-store",
      }),
      fetch(
        `https://api.github.com/repos/${fullName}/git/trees/${repoData.default_branch}?recursive=1`,
        {
          headers,
          cache: "no-store",
        }
      ),
      fetch(`https://api.github.com/repos/${fullName}/contributors?per_page=6`, {
        headers,
        cache: "no-store",
      }),
    ]);

    let lastCommit: {
      sha: string;
      message: string;
      author: string;
      date: string;
      url: string;
    } | null = null;

    if (commitRes.ok) {
      const commitData = (await commitRes.json()) as GitHubCommit[];
      const commit = commitData[0];
      if (commit) {
        lastCommit = {
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.commit.author?.name || "Unknown",
          date: commit.commit.author?.date || "",
          url: commit.html_url,
        };
      }
    }

    let fileCount: number | null = null;
    if (treeRes.ok) {
      const treeData = (await treeRes.json()) as GitHubTree;
      fileCount =
        treeData.tree?.filter((node) => node.type === "blob").length ?? null;
    }

    let contributors: Array<{
      login: string;
      url: string;
      contributions: number;
    }> = [];
    if (contributorsRes.ok) {
      const contributorData = (await contributorsRes.json()) as GitHubContributor[];
      contributors = contributorData.slice(0, 6).map((c) => ({
        login: c.login,
        url: c.html_url,
        contributions: c.contributions,
      }));
    }

    return NextResponse.json({
      repo: {
        fullName: repoData.full_name,
        description: repoData.description,
        private: repoData.private,
        archived: repoData.archived,
        disabled: repoData.disabled,
        visibility: repoData.visibility,
        homepage: repoData.homepage,
        owner: repoData.owner?.login || "",
        sizeKb: repoData.size,
        stars: repoData.stargazers_count,
        watchers: repoData.subscribers_count,
        forks: repoData.forks_count,
        network: repoData.network_count,
        openIssues: repoData.open_issues_count,
        defaultBranch: repoData.default_branch,
        license: repoData.license?.name || null,
        topics: repoData.topics || [],
        language: repoData.language,
        createdAt: repoData.created_at,
        updatedAt: repoData.updated_at,
        pushedAt: repoData.pushed_at,
        fileCount,
      },
      lastCommit,
      contributors,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch repo details";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
