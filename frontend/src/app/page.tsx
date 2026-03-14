"use client";

import { useState, useCallback, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/components/AppContext";

type EntryMode = "guest" | "github";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    repoUrl, setRepoUrl,
    githubToken, setGithubToken,
    error, setError,
    analyzeRepo,
  } = useAppContext();

  const [entryMode, setEntryMode] = useState<EntryMode>("guest");
  const [signInPending, setSignInPending] = useState(false);
  const [githubAuthReady, setGithubAuthReady] = useState<boolean | null>(null);
  const [repos, setRepos] = useState<{ id: number; fullName: string; owner: string; name: string; url: string; private: boolean; role: string; updatedAt: string }[]>([]);
  const [cityHistory, setCityHistory] = useState<{ repoUrl: string; label: string; timestamp: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function checkAuthConfig() {
      try {
        const res = await fetch("/api/auth/config-status", { method: "GET" });
        const data = await res.json();
        if (!cancelled) setGithubAuthReady(Boolean(data.githubOauthConfigured));
      } catch {
        if (!cancelled) setGithubAuthReady(false);
      }
    }
    checkAuthConfig();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("codecity.repoHistory");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setCityHistory(parsed.slice(0, 12));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setRepos([]);
      setEntryMode("guest");
      return;
    }
    setEntryMode("github");
  }, [status]);

  const handleGitHubSignIn = useCallback(async () => {
    setError(null);
    setSignInPending(true);
    try {
      await signIn("github", { callbackUrl: "/" });
    } catch {
      setSignInPending(false);
      setError("Failed to start GitHub sign in. Please try again.");
    }
  }, [setError]);

  useEffect(() => {
    if (status === "authenticated") setSignInPending(false);
  }, [status]);

  const handleAnalyze = useCallback(async () => {
    const effectiveRepoUrl = repoUrl.trim();
    if (!effectiveRepoUrl) return;
    router.push("/architecture");
    const success = await analyzeRepo(effectiveRepoUrl);
    if (!success) {
      router.push("/");
    }
  }, [repoUrl, analyzeRepo, router]);

  if (signInPending) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050b15] text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,211,238,0.2),transparent_42%),radial-gradient(circle_at_78%_80%,rgba(59,130,246,0.2),transparent_40%)]" />
        <div className="relative w-[min(560px,92vw)] rounded-3xl border border-cyan-300/20 bg-slate-950/75 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-center gap-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-cyan-300" />
            <span className="h-3 w-3 animate-pulse rounded-full bg-blue-300 [animation-delay:180ms]" />
            <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-300 [animation-delay:320ms]" />
          </div>
          <div className="mx-auto mb-5 h-16 w-16 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-200" />
          <h2 className="text-center text-2xl font-semibold text-white">Redirecting to GitHub</h2>
          <p className="mt-3 text-center text-sm text-slate-300">
            Preparing secure OAuth sign-in so you can grant repository access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070d17] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(80,200,255,0.22),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(73,134,255,0.25),transparent_42%),radial-gradient(circle_at_52%_82%,rgba(78,255,177,0.16),transparent_45%)]" />
      <div className="pointer-events-none absolute -left-28 top-14 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl animate-float-orb" />
      <div className="pointer-events-none absolute -right-24 top-28 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl animate-float-orb-delayed" />
      <div className="pointer-events-none absolute -bottom-30 left-1/2 h-80 w-2xl -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl animate-float-orb" />
      <div className="landing-grid-overlay pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-10 pt-8 md:px-10 lg:px-14">
        <div className="animate-rise-in flex items-center justify-between">
          <div className="animate-fluid-gradient bg-linear-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text pb-1 text-5xl font-extrabold leading-[1.12] tracking-tight text-transparent sm:text-6xl lg:text-7xl">
            Code City
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=CodeCity"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-cyan-300/35 bg-slate-900/65 px-3 py-1.5 text-xs text-cyan-100 transition hover:border-cyan-200/70 hover:bg-slate-900"
            >
              Get Access Token
            </a>
            {status === "authenticated" && (
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-lg border border-slate-500/40 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid flex-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="animate-rise-in-delayed">
            <p className="mb-5 text-sm font-medium tracking-wide text-cyan-200/90">
              Understand architecture in minutes
            </p>
            <h1 className="max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Turn any repo into a
              <span className="animate-fluid-gradient bg-linear-to-r from-cyan-300 via-blue-300 to-emerald-300 bg-clip-text text-transparent">
                {" "}living code city
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Visualize folders as districts and files as towers so you can find hotspots fast.
            </p>

            <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
              {[
                { label: "3D Map", value: "District-based layout" },
                { label: "Hotspots", value: "Risk-first navigation" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-500/20 bg-slate-900/50 p-4 backdrop-blur-md">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-cyan-200/85 uppercase">{item.label}</p>
                  <p className="mt-2 text-sm text-slate-200">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="animate-rise-in-late">
            <div className="relative rounded-3xl border border-slate-300/20 bg-slate-950/72 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white sm:text-2xl">Start a New City</h2>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setEntryMode("guest")}
                  className={`group relative overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition ${
                    entryMode === "guest"
                      ? "border-cyan-300/70 bg-[linear-gradient(150deg,rgba(8,145,178,0.28),rgba(15,23,42,0.7))] shadow-[0_12px_35px_rgba(8,145,178,0.25)]"
                      : "border-slate-600/50 bg-slate-900/45 hover:border-cyan-300/40 hover:bg-slate-900/65"
                  }`}
                >
                  <div className="absolute -right-7 -top-8 h-16 w-16 rounded-full bg-cyan-300/15 blur-xl" />
                  <div className="relative">
                    <p className="text-[11px] font-semibold tracking-[0.13em] text-cyan-200 uppercase">Classic</p>
                    <p className="mt-1 text-sm font-semibold text-white">Use as Guest</p>
                    <p className="mt-1 text-xs text-slate-300">Paste a repo link manually and start instantly.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("github")}
                  className={`group relative overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition ${
                    entryMode === "github"
                      ? "border-emerald-300/70 bg-[linear-gradient(150deg,rgba(5,150,105,0.25),rgba(15,23,42,0.7))] shadow-[0_12px_35px_rgba(16,185,129,0.2)]"
                      : "border-slate-600/50 bg-slate-900/45 hover:border-emerald-300/45 hover:bg-slate-900/65"
                  }`}
                >
                  <div className="absolute -right-7 -top-8 h-16 w-16 rounded-full bg-emerald-300/15 blur-xl" />
                  <div className="relative">
                    <p className="text-[11px] font-semibold tracking-[0.13em] text-emerald-200 uppercase">Recommended</p>
                    <p className="mt-1 text-sm font-semibold text-white">Use GitHub Mode</p>
                    <p className="mt-1 text-xs text-slate-300">Then use the dedicated sign-in panel below.</p>
                  </div>
                </button>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); handleAnalyze(); }}
                className="flex min-h-88.75 flex-col space-y-4"
              >
                {entryMode === "guest" && (
                  <>
                    <div>
                      <label className="mb-2 block text-xs font-semibold tracking-[0.13em] text-slate-300 uppercase">
                        Repository URL
                      </label>
                      <input
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="https://github.com/owner/repo"
                        className="w-full rounded-xl border border-slate-600/50 bg-slate-900/70 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold tracking-[0.13em] text-slate-300 uppercase">
                        GitHub Token (optional)
                      </label>
                      <input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="Recommended for large repos"
                        className="w-full rounded-xl border border-slate-600/50 bg-slate-900/70 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                      />
                      <p className="mt-2 text-xs text-slate-400">
                        {githubToken ? "Token detected" : "Optional but recommended for larger repos"}
                      </p>
                    </div>
                  </>
                )}

                {entryMode === "github" && status !== "authenticated" && (
                  <div className="flex h-full flex-1 flex-col justify-between gap-3">
                    <div className="rounded-xl border border-cyan-300/30 bg-cyan-900/15 p-4 text-sm text-cyan-100">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="max-w-md">
                          <p className="font-medium">Sign in with GitHub to authorize this app and access your repositories.</p>
                          {githubAuthReady === false && (
                            <div className="mt-2 text-xs text-amber-200">
                              OAuth config missing. Update .env.local and restart the app.
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { void handleGitHubSignIn(); }}
                          className="shrink-0 rounded-lg border border-cyan-200/45 bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-100/80 hover:bg-cyan-500/30"
                        >
                          Continue with GitHub
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-700/55 bg-slate-900/55 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">Step 1</p>
                        <p className="mt-1 text-xs text-slate-200">Grant access through GitHub OAuth.</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/55 bg-slate-900/55 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">Step 2</p>
                        <p className="mt-1 text-xs text-slate-200">Open Projects Workspace and pick a repository.</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/55 bg-slate-900/55 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">Step 3</p>
                        <p className="mt-1 text-xs text-slate-200">Preview repo details and analyze to build the city.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="rounded-lg border border-slate-700/55 bg-slate-900/55 p-3 text-xs text-slate-300">
                        Browse your own, shared, or any repository in Projects Workspace.
                      </div>
                      <div className="text-xs text-slate-400">
                        Prefer manual mode? Switch to Guest to paste any repository URL directly.
                      </div>
                    </div>
                  </div>
                )}

                {entryMode === "github" && status === "authenticated" && (
                  <div className="flex flex-1 flex-col">
                    <div className="rounded-xl border border-emerald-300/35 bg-emerald-900/15 p-4 text-sm text-emerald-100">
                      Connected as {session?.user?.name || session?.user?.email || "GitHub user"}. Open your projects workspace to browse repositories and analyze a city.
                      <button
                        type="button"
                        onClick={() => router.push("/projects")}
                        className="mt-3 w-full rounded-lg border border-emerald-200/45 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-100/80 hover:bg-emerald-500/30"
                      >
                        Open Projects Workspace
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-700/55 bg-slate-900/55 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Repos Loaded</p>
                        <p className="mt-1 text-lg font-semibold text-white">{repos.length}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/55 bg-slate-900/55 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Recent Cities</p>
                        <p className="mt-1 text-lg font-semibold text-white">{cityHistory.length}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/55 bg-slate-900/55 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Access</p>
                        <p className="mt-1 text-xs text-slate-200">Your own, shared, and external repos.</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-700/55 bg-slate-900/55 p-3 text-xs text-slate-300">
                      Your session is active. Repository access uses your GitHub account permissions.
                    </div>
                  </div>
                )}

                {entryMode === "guest" && (
                  <button
                    type="submit"
                    className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl bg-linear-to-r from-cyan-400 via-blue-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
                    <span className="relative">Analyze Repository</span>
                  </button>
                )}

                {entryMode === "guest" && (
                  <div className="pt-1">
                    <p className="mb-2 text-xs font-semibold tracking-[0.13em] text-slate-400 uppercase">
                      Quick Start
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {["facebook/react", "vercel/next.js", "denoland/deno"].map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => setRepoUrl(`https://github.com/${example}`)}
                          className="rounded-full border border-slate-500/35 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form>

              {error && (
                <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
