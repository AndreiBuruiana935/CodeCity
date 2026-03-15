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
      const raw = window.localStorage.getItem("codeatlas.repoHistory");
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
      await signIn("github", { callbackUrl: "/projects" });
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
            CodeAtlas
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=CodeAtlas"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
            >
              Get Access Token
            </a>
            {status === "authenticated" && (
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
                Sign Out
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
              Turn any repo into an
              <span className="animate-fluid-gradient bg-linear-to-r from-cyan-300 via-blue-300 to-emerald-300 bg-clip-text text-transparent">
                {" "}interactive architecture graph
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Visualize files as nodes and dependencies as edges in a force-directed graph — spot hotspots and clusters instantly.
            </p>
          </section>

          <section className="animate-rise-in-late">
            <div className="relative rounded-3xl border border-slate-300/20 bg-slate-950/72 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white sm:text-2xl">Explore a Repository</h2>
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
                className="flex flex-col space-y-4"
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
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-900/20">
                      <svg className="h-7 w-7 text-cyan-200" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                    </div>
                    <p className="text-center text-sm text-slate-300">
                      Connect your GitHub to explore any public repository or your own — and pick up where you left off on ones you've analyzed before.
                    </p>
                    {githubAuthReady === false && (
                      <p className="text-center text-xs text-amber-200">
                        OAuth config missing. Update .env.local and restart the app.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => { void handleGitHubSignIn(); }}
                      className="w-full rounded-xl bg-linear-to-r from-cyan-400 via-blue-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                    >
                      Continue with GitHub
                    </button>
                    <p className="text-center text-xs text-slate-500">
                      Prefer manual mode? Switch to Guest above.
                    </p>
                  </div>
                )}

                {entryMode === "github" && status === "authenticated" && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-900/20">
                      <svg className="h-7 w-7 text-emerald-200" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-center text-sm text-slate-200">
                      Signed in as <span className="font-semibold text-emerald-200">{session?.user?.name || session?.user?.email || "GitHub user"}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/projects")}
                      className="w-full rounded-xl bg-linear-to-r from-cyan-400 via-blue-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                    >
                      Open Projects Workspace
                    </button>
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
