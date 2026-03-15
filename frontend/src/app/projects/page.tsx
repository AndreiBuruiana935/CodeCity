"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/components/AppContext";

interface UserRepo {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  url: string;
  private: boolean;
  role: "admin" | "write" | "read";
  updatedAt: string;
}

interface RepoDetails {
  repo: {
    fullName: string;
    description: string | null;
    private: boolean;
    archived: boolean;
    disabled: boolean;
    visibility: string;
    homepage: string | null;
    owner: string;
    sizeKb: number;
    stars: number;
    watchers: number;
    forks: number;
    network: number;
    openIssues: number;
    defaultBranch: string;
    license: string | null;
    topics: string[];
    language: string | null;
    createdAt: string;
    updatedAt: string;
    pushedAt: string;
    fileCount: number | null;
  };
  lastCommit: {
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
  } | null;
  contributors: Array<{
    login: string;
    url: string;
    contributions: number;
  }>;
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    repoUrl, setRepoUrl,
    githubToken, setGithubToken,
    cityHistory,
    analyzeRepo,
    softResetCity,
    setError,
  } = useAppContext();

  const [repoSearch, setRepoSearch] = useState("");
  const [repos, setRepos] = useState<UserRepo[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [selectedProjectFullName, setSelectedProjectFullName] = useState<string | null>(null);
  const [selectedProjectUrl, setSelectedProjectUrl] = useState<string>("");
  const [projectDetails, setProjectDetails] = useState<RepoDetails | null>(null);
  const [projectDetailsLoading, setProjectDetailsLoading] = useState(false);
  const [projectDetailsError, setProjectDetailsError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  // Load repos on mount
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    async function loadRepos() {
      setRepoLoading(true);
      setRepoError(null);
      try {
        const res = await fetch("/api/github/repos", { method: "GET" });
        const data: unknown = await res.json();
        if (!res.ok) {
          const err = data as { error?: string };
          throw new Error(err.error || "Failed to load repositories");
        }
        if (!cancelled) setRepos((data.repos || []) as UserRepo[]);
      } catch (err) {
        if (!cancelled) setRepoError(err instanceof Error ? err.message : "Failed to load repositories");
      } finally {
        if (!cancelled) setRepoLoading(false);
      }
    }

    loadRepos();
    return () => { cancelled = true; };
  }, [status]);

  // Load project details when a project is selected
  useEffect(() => {
    if (status !== "authenticated" || !selectedProjectFullName) return;
    const fullName = selectedProjectFullName;
    let cancelled = false;

    async function loadProjectDetails() {
      setProjectDetailsLoading(true);
      setProjectDetailsError(null);
      try {
        const res = await fetch(
          `/api/github/repo-details?fullName=${encodeURIComponent(fullName)}`,
          { method: "GET" }
        );
        const data: unknown = await res.json();
        if (!res.ok) {
          const err = data as { error?: string };
          throw new Error(err.error || "Failed to load repository details");
        }
        if (!cancelled) setProjectDetails(data as RepoDetails);
      } catch (err) {
        if (!cancelled) setProjectDetailsError(err instanceof Error ? err.message : "Failed to load repository details");
      } finally {
        if (!cancelled) setProjectDetailsLoading(false);
      }
    }

    loadProjectDetails();
    return () => { cancelled = true; };
  }, [selectedProjectFullName, status]);

  const filteredRepos = useMemo(() => {
    const term = repoSearch.trim().toLowerCase();
    if (!term) return repos.slice(0, 40);
    return repos
      .filter((repo) => `${repo.fullName} ${repo.owner} ${repo.name}`.toLowerCase().includes(term))
      .slice(0, 40);
  }, [repoSearch, repos]);

  const filteredHistory = useMemo(() => {
    const term = repoSearch.trim().toLowerCase();
    if (!term) return cityHistory.slice(0, 10);
    return cityHistory
      .filter((item) => item.label.toLowerCase().includes(term))
      .slice(0, 10);
  }, [cityHistory, repoSearch]);

  const selectProject = useCallback((nextRepoUrl: string) => {
    const normalized = nextRepoUrl.replace(/\/$/, "");
    const fullName = normalized.replace(/^https?:\/\/github\.com\//i, "");
    if (!/^[^/]+\/[^/]+$/.test(fullName)) {
      setProjectDetails(null);
      setProjectDetailsError("Invalid GitHub repository URL");
      setSelectedProjectFullName(null);
      setSelectedProjectUrl(normalized);
      return;
    }
    setSelectedProjectUrl(normalized);
    setSelectedProjectFullName(fullName);
    setProjectDetails(null);
    setProjectDetailsError(null);
  }, []);

  const openCityFromRepo = useCallback(
    async (nextRepoUrl: string) => {
      softResetCity();
      setRepoUrl(nextRepoUrl);
      setError(null);
      router.push("/architecture");
      const success = await analyzeRepo(nextRepoUrl);
      if (!success) {
        router.push("/projects");
      }
    },
    [analyzeRepo, softResetCity, setRepoUrl, setError, router]
  );

  const handleAnalyzeExternal = useCallback(async () => {
    if (!repoUrl.trim()) return;
    softResetCity();
    router.push("/architecture");
    const success = await analyzeRepo(repoUrl.trim());
    if (!success) {
      router.push("/projects");
    }
  }, [repoUrl, analyzeRepo, softResetCity, router]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#070d17] text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-200" />
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#070d17] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(80,200,255,0.2),transparent_42%),radial-gradient(circle_at_84%_10%,rgba(64,255,192,0.15),transparent_38%)]" />
      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col px-6 py-8 md:px-10 lg:px-14">
        <div className="mb-5 flex items-center justify-between border-b border-slate-700/40 pb-4">
          <div className="flex items-center gap-4">
            <h1 className="bg-linear-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
              Projects Workspace
            </h1>
            <div className="hidden items-center gap-2 rounded-lg border border-slate-600/40 bg-slate-900/60 px-3 py-1.5 sm:inline-flex">
              {session?.user?.image && (
                <img src={session.user.image} alt="" className="h-6 w-6 rounded-full" />
              )}
              <span className="text-sm font-medium text-cyan-100">
                {session?.user?.name || session?.user?.email || "GitHub user"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
              Home
            </button>
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
              Sign Out
            </button>
          </div>
        </div>

        <div className="grid h-[calc(100vh-11rem)] min-h-0 flex-1 gap-4 lg:grid-cols-[0.95fr_1.25fr]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-600/45 bg-slate-950/75 p-4 backdrop-blur-xl">
            <div className="mb-3 shrink-0 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                Analyze External Repository
              </p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded-lg border border-slate-600/50 bg-slate-900/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                />
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="Optional token override"
                  className="w-full rounded-lg border border-slate-600/50 bg-slate-900/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectProject(repoUrl)}
                    disabled={!repoUrl.trim()}
                    className="rounded-lg border border-slate-500/45 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Preview Details
                  </button>
                  <button
                    type="button"
                    onClick={handleAnalyzeExternal}
                    disabled={!repoUrl.trim()}
                    className="rounded-lg bg-linear-to-r from-cyan-400 via-blue-500 to-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Analyze Now
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-3 shrink-0 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">
                Select Project
              </h2>
              <button
                type="button"
                onClick={async () => {
                  setRepoLoading(true);
                  setRepoError(null);
                  try {
                    const res = await fetch("/api/github/repos", { method: "GET" });
                    const data: unknown = await res.json();
                    if (!res.ok) {
                      const err = data as { error?: string };
                      throw new Error(err.error || "Failed to reload repositories");
                    }
                    setRepos((data.repos || []) as UserRepo[]);
                  } catch (err) {
                    setRepoError(err instanceof Error ? err.message : "Failed to reload repositories");
                  } finally {
                    setRepoLoading(false);
                  }
                }}
                className="rounded-md border border-slate-500/35 px-2 py-1 text-[11px] text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
              >
                Refresh
              </button>
            </div>

            <input
              type="text"
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
              placeholder="Search history and repos"
              className="mb-3 w-full shrink-0 rounded-lg border border-slate-600/50 bg-slate-900/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
            />

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Recent Repositories
                </p>
                <div className="space-y-1">
                  {filteredHistory.length === 0 && (
                    <div className="rounded-md border border-slate-700/50 bg-slate-950/60 px-2.5 py-2 text-xs text-slate-400">
                      No history yet.
                    </div>
                  )}
                  {filteredHistory.map((item) => {
                    const selected = selectedProjectUrl === item.repoUrl;
                    return (
                      <button
                        key={`${item.repoUrl}-${item.timestamp}`}
                        type="button"
                        onClick={() => selectProject(item.repoUrl)}
                        className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                          selected
                            ? "border-cyan-300/60 bg-cyan-900/20"
                            : "border-slate-700/60 bg-slate-950/60 hover:border-cyan-300/35"
                        }`}
                      >
                        <p className="truncate text-xs font-semibold text-slate-100">{item.label}</p>
                        <p className="text-[11px] text-slate-400">{new Date(item.timestamp).toLocaleString()}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  My Repositories
                </p>
                <div className="space-y-1">
                  {repoLoading && (
                    <div className="rounded-md border border-slate-700/50 bg-slate-950/60 px-2.5 py-2 text-xs text-slate-300">
                      Loading repositories...
                    </div>
                  )}
                  {!repoLoading && filteredRepos.length === 0 && (
                    <div className="rounded-md border border-slate-700/50 bg-slate-950/60 px-2.5 py-2 text-xs text-slate-400">
                      No repositories found.
                    </div>
                  )}
                  {!repoLoading &&
                    filteredRepos.map((repo) => {
                      const url = `https://github.com/${repo.fullName}`;
                      const selected = selectedProjectUrl === url;
                      return (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => selectProject(url)}
                          className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                            selected
                              ? "border-cyan-300/60 bg-cyan-900/20"
                              : "border-slate-700/60 bg-slate-950/60 hover:border-cyan-300/35"
                          }`}
                        >
                          <p className="truncate text-xs font-semibold text-slate-100">{repo.fullName}</p>
                          <p className="text-[11px] text-slate-400">
                            {repo.private ? "Private" : "Public"} · {repo.role}
                          </p>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>

            {repoError && <p className="mt-2 text-xs text-rose-300">{repoError}</p>}
          </section>

          <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-600/45 bg-slate-950/75 p-4 backdrop-blur-xl">
            {!selectedProjectUrl && (
              <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4 text-sm text-slate-300">
                Select a repository on the left to preview details and analyze.
              </div>
            )}

            {selectedProjectUrl && (
              <div className="flex h-full min-h-0 flex-col">
                <div>
                  <p className="text-xs uppercase tracking-[0.13em] text-cyan-200">Repository</p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    {selectedProjectFullName || selectedProjectUrl.replace(/^https?:\/\/github\.com\//i, "")}
                  </h2>
                  <a
                    href={selectedProjectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-cyan-200 hover:text-cyan-100"
                  >
                    Open on GitHub
                  </a>
                </div>

                <div className="sticky top-0 z-10 mt-3 border-y border-slate-700/50 bg-slate-950/90 py-3 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => openCityFromRepo(selectedProjectUrl)}
                    className="inline-flex items-center justify-center rounded-xl bg-linear-to-r from-cyan-400 via-blue-500 to-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                  >
                    Analyze This Repository
                  </button>
                </div>

                <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  {projectDetailsLoading && (
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-sm text-slate-300">
                      Loading repository details...
                    </div>
                  )}

                  {projectDetailsError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
                      {projectDetailsError}
                    </div>
                  )}

                  {projectDetails && !projectDetailsLoading && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Files</p>
                        <p className="mt-1 text-xl font-semibold text-white">
                          {projectDetails.repo.fileCount ?? "Unknown"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Size</p>
                        <p className="mt-1 text-xl font-semibold text-white">{projectDetails.repo.sizeKb} KB</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Visibility</p>
                        <p className="mt-1 text-base font-semibold text-white">{projectDetails.repo.visibility}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Language</p>
                        <p className="mt-1 text-base font-semibold text-white">
                          {projectDetails.repo.language || "Unknown"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Stars / Watchers</p>
                        <p className="mt-1 text-base font-semibold text-white">
                          {projectDetails.repo.stars} / {projectDetails.repo.watchers}
                        </p>
                      </div>
                      <a
                        href={`${selectedProjectUrl}/issues`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3 transition hover:border-cyan-300/50"
                      >
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Open Issues</p>
                        <p className="mt-1 text-base font-semibold text-cyan-100 underline decoration-cyan-300/40 underline-offset-2">{projectDetails.repo.openIssues}</p>
                      </a>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Default Branch</p>
                        <p className="mt-1 text-base font-semibold text-white">{projectDetails.repo.defaultBranch}</p>
                      </div>
                      <a
                        href={projectDetails.repo.license ? `${selectedProjectUrl}/blob/${projectDetails.repo.defaultBranch}/LICENSE` : `${selectedProjectUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3 transition hover:border-cyan-300/50"
                      >
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">License</p>
                        <p className="mt-1 text-base font-semibold text-cyan-100 underline decoration-cyan-300/40 underline-offset-2">{projectDetails.repo.license || "None"}</p>
                      </a>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Created</p>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {new Date(projectDetails.repo.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}

                  {projectDetails?.repo.description && (
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Description</p>
                      <p className="mt-1 text-sm text-slate-200">{projectDetails.repo.description}</p>
                    </div>
                  )}

                  {(projectDetails?.repo.topics?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Topics</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(projectDetails?.repo.topics ?? []).slice(0, 12).map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full border border-cyan-300/30 bg-cyan-900/20 px-2 py-0.5 text-[11px] text-cyan-100"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {projectDetails?.lastCommit && (
                    <a
                      href={projectDetails.lastCommit.url || `${selectedProjectUrl}/commit/${projectDetails.lastCommit.sha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-slate-700/60 bg-slate-900/55 p-3 transition hover:border-cyan-300/50"
                    >
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Last Commit</p>
                      <p className="mt-1 text-sm font-semibold text-cyan-100 underline decoration-cyan-300/40 underline-offset-2">
                        {projectDetails.lastCommit.message.split("\n")[0]}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {projectDetails.lastCommit.author}
                        {projectDetails.lastCommit.date
                          ? ` · ${new Date(projectDetails.lastCommit.date).toLocaleString()}`
                          : ""}
                      </p>
                    </a>
                  )}

                  {(projectDetails?.contributors?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Top Contributors</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {(projectDetails?.contributors ?? []).map((contributor) => (
                          <a
                            key={contributor.login}
                            href={contributor.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-slate-700/55 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/45"
                          >
                            <div className="font-semibold">{contributor.login}</div>
                            <div className="text-slate-400">{contributor.contributions} commits</div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
