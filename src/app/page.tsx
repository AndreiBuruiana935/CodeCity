"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { CitySchema, Building, OnboardingSummary, QuestionResponse, DistrictDetails } from "@/types/city";
import { signIn, signOut, useSession } from "next-auth/react";
import SidePanel from "@/components/SidePanel";
import OnboardingOverlay from "@/components/OnboardingOverlay";
import QuestionBar from "@/components/QuestionBar";
import TourOverlay from "@/components/TourOverlay";
import FileTree from "@/components/FileTree";
import RepoGraph from "@/components/RepoGraph";

type AppState = "landing" | "projects" | "loading" | "city";

type EntryMode = "guest" | "github";

interface CityHistoryItem {
  repoUrl: string;
  label: string;
  timestamp: number;
}

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

export default function Home() {
  const { data: session, status } = useSession();
  const [state, setState] = useState<AppState>("landing");
  const [entryMode, setEntryMode] = useState<EntryMode>("guest");
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [repos, setRepos] = useState<UserRepo[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [githubAuthReady, setGithubAuthReady] = useState<boolean | null>(null);
  const [selectedProjectFullName, setSelectedProjectFullName] = useState<string | null>(null);
  const [selectedProjectUrl, setSelectedProjectUrl] = useState<string>("");
  const [projectDetails, setProjectDetails] = useState<RepoDetails | null>(null);
  const [projectDetailsLoading, setProjectDetailsLoading] = useState(false);
  const [projectDetailsError, setProjectDetailsError] = useState<string | null>(null);
  const [repoInputMode, setRepoInputMode] = useState<"link" | "list">("list");
  const [cityHistory, setCityHistory] = useState<CityHistoryItem[]>([]);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [city, setCity] = useState<CitySchema | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingSummary | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [highlightedBuildings, setHighlightedBuildings] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [signInPending, setSignInPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState("");
  const transientCameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuthConfig() {
      try {
        const res = await fetch("/api/auth/config-status", { method: "GET" });
        const data = await res.json();
        if (!cancelled) {
          setGithubAuthReady(Boolean(data.githubOauthConfigured));
        }
      } catch {
        if (!cancelled) {
          setGithubAuthReady(false);
        }
      }
    }

    checkAuthConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("codecity.repoHistory");
      if (!raw) return;
      const parsed = JSON.parse(raw) as CityHistoryItem[];
      if (Array.isArray(parsed)) {
        setCityHistory(parsed.slice(0, 12));
      }
    } catch {
      // Ignore malformed local history
    }
  }, []);

  useEffect(() => {
    return () => {
      if (transientCameraTimeoutRef.current) {
        clearTimeout(transientCameraTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setRepos([]);
      setRepoError(null);
      setRepoSearch("");
      setEntryMode("guest");
      if (state === "projects") {
        setState("landing");
      }
      return;
    }

    setEntryMode("github");
    if (state === "landing") {
      setState("projects");
    }

    let cancelled = false;

    async function loadRepos() {
      setRepoLoading(true);
      setRepoError(null);

      try {
        const res = await fetch("/api/github/repos", { method: "GET" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load repositories");
        }

        if (!cancelled) {
          setRepos((data.repos || []) as UserRepo[]);
        }
      } catch (err) {
        if (!cancelled) {
          setRepoError(err instanceof Error ? err.message : "Failed to load repositories");
        }
      } finally {
        if (!cancelled) {
          setRepoLoading(false);
        }
      }
    }

    loadRepos();

    return () => {
      cancelled = true;
    };
  }, [status, state]);

  useEffect(() => {
    if (
      state !== "projects" ||
      status !== "authenticated" ||
      !selectedProjectFullName
    ) {
      return;
    }
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
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load repository details");
        }

        if (!cancelled) {
          setProjectDetails(data as RepoDetails);
        }
      } catch (err) {
        if (!cancelled) {
          setProjectDetailsError(
            err instanceof Error ? err.message : "Failed to load repository details"
          );
        }
      } finally {
        if (!cancelled) {
          setProjectDetailsLoading(false);
        }
      }
    }

    loadProjectDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectFullName, state, status]);

  const filteredRepos = useMemo(() => {
    const term = repoSearch.trim().toLowerCase();
    if (!term) return repos.slice(0, 40);
    return repos
      .filter((repo) =>
        `${repo.fullName} ${repo.owner} ${repo.name}`.toLowerCase().includes(term)
      )
      .slice(0, 40);
  }, [repoSearch, repos]);

  const filteredHistory = useMemo(() => {
    const term = repoSearch.trim().toLowerCase();
    if (!term) return cityHistory.slice(0, 10);
    return cityHistory
      .filter((item) => item.label.toLowerCase().includes(term))
      .slice(0, 10);
  }, [cityHistory, repoSearch]);

  const persistHistory = useCallback((nextHistory: CityHistoryItem[]) => {
    setCityHistory(nextHistory);
    try {
      window.localStorage.setItem(
        "codecity.repoHistory",
        JSON.stringify(nextHistory)
      );
    } catch {
      // Ignore persistence errors
    }
  }, []);

  const rememberCity = useCallback(
    (rawRepoUrl: string) => {
      const trimmed = rawRepoUrl.trim();
      if (!trimmed) return;
      const normalized = trimmed.replace(/\/$/, "");
      const label = normalized.replace(/^https?:\/\/github\.com\//i, "");
      const next = [
        {
          repoUrl: normalized,
          label,
          timestamp: Date.now(),
        },
        ...cityHistory.filter(
          (entry) => entry.repoUrl.toLowerCase() !== normalized.toLowerCase()
        ),
      ].slice(0, 12);
      persistHistory(next);
    },
    [cityHistory, persistHistory]
  );

  const flyToTransientTarget = useCallback((buildingId: string) => {
    if (transientCameraTimeoutRef.current) {
      clearTimeout(transientCameraTimeoutRef.current);
    }

    setCameraTarget(buildingId);
    transientCameraTimeoutRef.current = setTimeout(() => {
      setCameraTarget((current) => (current === buildingId ? null : current));
    }, 1800);
  }, []);

  const handleAnalyze = useCallback(async (overrideRepoUrl?: string) => {
    const effectiveRepoUrl = (overrideRepoUrl || repoUrl).trim();
    if (!effectiveRepoUrl) return;
    setState("loading");
    setError(null);
    setLoadingProgress("Fetching repository structure...");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          repoUrl: effectiveRepoUrl,
          options: {
            depth: "full",
            includeTests: false,
            githubToken: githubToken || undefined,
            enableAI: false,
          },
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      setLoadingProgress("Generating city layout...");
      const data = await res.json();
      setCity(data.city);
      setOnboarding(data.onboarding);
      rememberCity(effectiveRepoUrl);
      setState("city");
      setShowOnboarding(true);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Analysis timed out after 120 seconds. Try a smaller repository or shallow mode.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      setState("landing");
    }
  }, [repoUrl, githubToken, rememberCity]);

  const openCityFromRepo = useCallback(
    (nextRepoUrl: string) => {
      setRepoUrl(nextRepoUrl);
      setError(null);
      setShowCitySelector(false);
      setSelectedBuilding(null);
      setSelectedDistrictId(null);
      setHighlightedBuildings([]);
      setCameraTarget(null);
      void handleAnalyze(nextRepoUrl);
    },
    [handleAnalyze]
  );

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

  const handleGitHubSignIn = useCallback(async () => {
    setError(null);
    setSignInPending(true);
    try {
      await signIn("github", { callbackUrl: "/" });
    } catch {
      setSignInPending(false);
      setError("Failed to start GitHub sign in. Please try again.");
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      setSignInPending(false);
    }
  }, [status]);

  const handleBuildingClick = useCallback((building: Building) => {
    setSelectedDistrictId(null);
    setSelectedBuilding(building);
    setCameraTarget(building.id);
  }, []);

  const handleDistrictClick = useCallback((districtId: string) => {
    setSelectedBuilding(null);
    setSelectedDistrictId(districtId);
    setCameraTarget(null);
  }, []);

  const handleQuestionAnswer = useCallback((response: QuestionResponse) => {
    setHighlightedBuildings(response.highlightedBuildings);
    if (response.cameraFlyTo) {
      setCameraTarget(response.cameraFlyTo);
    }
  }, []);

  const handleBuildingFocus = useCallback((buildingId: string) => {
    setSelectedDistrictId(null);
    flyToTransientTarget(buildingId);
    setHighlightedBuildings([buildingId]);
  }, [flyToTransientTarget]);

  const selectedDistrictDetails = useMemo((): DistrictDetails | null => {
    if (!city || !selectedDistrictId) return null;
    const district = city.city.districts.find((d) => d.id === selectedDistrictId);
    if (!district) return null;

    const buildingCount = district.buildings.length;
    const totalLinesOfCode = district.buildings.reduce((sum, b) => sum + b.linesOfCode, 0);
    const averageRisk =
      buildingCount > 0
        ? Math.round(district.buildings.reduce((sum, b) => sum + b.riskScore, 0) / buildingCount)
        : 0;
    const maxRisk = district.buildings.reduce((max, b) => Math.max(max, b.riskScore), 0);
    const subdistrictCount = city.city.districts.filter((d) =>
      d.name !== district.name && d.name.startsWith(`${district.name}/`)
    ).length;
    const topFiles = [...district.buildings]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5)
      .map((b) => b.path);
    const neighborhood = district.name === "."
      ? "root"
      : district.name.split("/").slice(0, -1).join("/") || "root";

    return {
      id: district.id,
      name: district.name,
      neighborhood,
      buildingCount,
      subdistrictCount,
      totalLinesOfCode,
      averageRisk,
      maxRisk,
      description: `${district.name} has ${buildingCount} file${buildingCount === 1 ? "" : "s"} with ${totalLinesOfCode} total lines. Average risk is ${averageRisk}/100, and the highest-risk file reaches ${maxRisk}/100.`,
      topFiles,
    };
  }, [city, selectedDistrictId]);

  const handleTourStart = useCallback(() => {
    setTourActive(true);
    setTourStep(0);
    if (onboarding?.guidedTour[0]) {
      flyToTransientTarget(onboarding.guidedTour[0].buildingId);
    }
  }, [onboarding, flyToTransientTarget]);

  const handleTourNext = useCallback(() => {
    if (!onboarding) return;
    const next = tourStep + 1;
    if (next < onboarding.guidedTour.length) {
      setTourStep(next);
      flyToTransientTarget(onboarding.guidedTour[next].buildingId);
    }
  }, [tourStep, onboarding, flyToTransientTarget]);

  const handleTourPrev = useCallback(() => {
    if (!onboarding) return;
    const prev = tourStep - 1;
    if (prev >= 0) {
      setTourStep(prev);
      flyToTransientTarget(onboarding.guidedTour[prev].buildingId);
    }
  }, [tourStep, onboarding, flyToTransientTarget]);

  // Landing page
  if (state === "landing") {
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
                  {" "}
                  living code city
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
                  <div
                    key={item.label}
                    className="rounded-2xl border border-slate-500/20 bg-slate-900/50 p-4 backdrop-blur-md"
                  >
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-cyan-200/85 uppercase">
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm text-slate-200">{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="animate-rise-in-late">
              <div className="relative rounded-3xl border border-slate-300/20 bg-slate-950/72 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white sm:text-2xl">
                    Start a New City
                  </h2>
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
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAnalyze();
                  }}
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
                          {githubToken
                            ? "Token detected"
                            : "Optional but recommended for larger repos"}
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
                            onClick={() => {
                              void handleGitHubSignIn();
                            }}
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
                          onClick={() => setState("projects")}
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
                        {["facebook/react", "vercel/next.js", "denoland/deno"].map(
                          (example) => (
                            <button
                              key={example}
                              type="button"
                              onClick={() => setRepoUrl(`https://github.com/${example}`)}
                              className="rounded-full border border-slate-500/35 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
                            >
                              {example}
                            </button>
                          )
                        )}
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

  if (state === "projects") {
    return (
      <div className="relative h-screen overflow-hidden bg-[#070d17] text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(80,200,255,0.2),transparent_42%),radial-gradient(circle_at_84%_10%,rgba(64,255,192,0.15),transparent_38%)]" />
        <div className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col px-6 py-8 md:px-10 lg:px-14">
            <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="bg-linear-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text text-3xl font-bold text-transparent">
                Projects Workspace
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                Signed in as {session?.user?.name || session?.user?.email || "GitHub user"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-lg border border-slate-500/45 bg-slate-900/65 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="grid h-[calc(100vh-11rem)] min-h-0 flex-1 gap-4 lg:grid-cols-[0.95fr_1.25fr]">
            <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-600/45 bg-slate-950/75 p-4 backdrop-blur-xl">
              <div className="mb-3 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
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
                      onClick={() => {
                        void handleAnalyze(repoUrl);
                      }}
                      disabled={!repoUrl.trim()}
                      className="rounded-lg bg-linear-to-r from-cyan-400 via-blue-500 to-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Analyze Now
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between">
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
                      const data = await res.json();
                      if (!res.ok) {
                        throw new Error(data.error || "Failed to reload repositories");
                      }
                      setRepos((data.repos || []) as UserRepo[]);
                    } catch (err) {
                      setRepoError(
                        err instanceof Error ? err.message : "Failed to reload repositories"
                      );
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
                className="mb-3 w-full rounded-lg border border-slate-600/50 bg-slate-900/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
              />

              <div className="h-full min-h-0 space-y-3 overflow-y-auto pr-1">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Recent Cities
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
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Open Issues</p>
                        <p className="mt-1 text-base font-semibold text-white">{projectDetails.repo.openIssues}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Default Branch</p>
                        <p className="mt-1 text-base font-semibold text-white">{projectDetails.repo.defaultBranch}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">License</p>
                        <p className="mt-1 text-base font-semibold text-white">{projectDetails.repo.license || "None"}</p>
                      </div>
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
                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Last Commit</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {projectDetails.lastCommit.message.split("\n")[0]}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {projectDetails.lastCommit.author}
                        {projectDetails.lastCommit.date
                          ? ` · ${new Date(projectDetails.lastCommit.date).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
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

  // Loading screen
  if (state === "loading") {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0a0a1a]">
        <div className="relative mb-8">
          <div className="w-20 h-20 border-2 border-indigo-600/30 rounded-full animate-spin-slow" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse-glow" />
          </div>
        </div>
        <h2 className="text-white text-xl font-semibold mb-2">
          Building your city...
        </h2>
        <p className="text-gray-400 text-sm">{loadingProgress}</p>
        <p className="text-gray-600 text-xs mt-4">
          Analyzing {repoUrl.replace("https://github.com/", "")}
        </p>
      </div>
    );
  }

  // City view
  return (
    <div className="flex h-screen w-screen flex-col bg-[#070d17] text-slate-100">
      {/* Top bar */}
      <div className="z-20 shrink-0 border-b border-cyan-300/15 bg-slate-950/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-4">
            <h1 className="bg-linear-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text text-lg font-bold text-transparent">
              Code City
            </h1>
            <span className="font-mono text-sm text-slate-300">
              {city?.city.name}
            </span>
            <span className="text-xs text-slate-500">
              {city?.city.language} / {city?.city.framework} /{" "}
              {city?.city.architecture}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setState("landing");
                setCity(null);
                setOnboarding(null);
                setSelectedBuilding(null);
                setSelectedDistrictId(null);
                setHighlightedBuildings([]);
                setCameraTarget(null);
                setSearchQuery("");
              }}
              className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            >
              New
            </button>
            <button
              onClick={handleTourStart}
              className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            >
              Tour
            </button>
            <button
              onClick={() => setShowOnboarding(true)}
              className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            >
              Guide
            </button>
            {status === "authenticated" && (
              <button
                onClick={() => signOut()}
                className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main 3-panel layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: File Tree */}
        {city && (
          <div className="w-64 shrink-0 overflow-hidden">
            <FileTree
              city={city}
              selectedBuildingId={selectedBuilding?.id || null}
              highlightedBuildings={highlightedBuildings}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onBuildingClick={handleBuildingClick}
              onDistrictClick={handleDistrictClick}
            />
          </div>
        )}

        {/* Center: 2D Graph */}
        <div className="relative min-w-0 flex-1">
          {city && (
            <RepoGraph
              city={city}
              selectedBuildingId={selectedBuilding?.id || null}
              highlightedBuildings={highlightedBuildings}
              cameraTarget={cameraTarget}
              onBuildingClick={handleBuildingClick}
              onDistrictClick={handleDistrictClick}
            />
          )}
        </div>

        {/* Right: Side Panel */}
        {(selectedBuilding || selectedDistrictId) && (
          <div className="w-[420px] shrink-0 overflow-y-auto border-l border-cyan-300/20 bg-slate-950/90">
            <SidePanel
              building={selectedBuilding}
              districtDetails={selectedDistrictDetails}
              onViewCode={(building) => {
                if (!city?.city.name?.includes("/")) return;
                const [owner, repo] = city.city.name.split("/");
                const encodedPath = building.path
                  .split("/")
                  .map((part) => encodeURIComponent(part))
                  .join("/");
                const url = `https://github.com/${owner}/${repo}/blob/main/${encodedPath}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              onClose={() => {
                setSelectedBuilding(null);
                setSelectedDistrictId(null);
                setCameraTarget(null);
                setHighlightedBuildings([]);
              }}
            />
          </div>
        )}
      </div>

      {/* Question bar */}
      {city && (
        <QuestionBar city={city} onboarding={onboarding} onAnswer={handleQuestionAnswer} />
      )}

      {/* Tour overlay */}
      {tourActive && onboarding && (
        <TourOverlay
          stops={onboarding.guidedTour}
          currentStop={tourStep}
          onNext={handleTourNext}
          onPrev={handleTourPrev}
          onEnd={() => setTourActive(false)}
        />
      )}

      {/* Onboarding overlay */}
      {showOnboarding && onboarding && (
        <OnboardingOverlay
          onboarding={onboarding}
          onClose={() => setShowOnboarding(false)}
          onTourStart={handleTourStart}
          onBuildingFocus={handleBuildingFocus}
        />
      )}
    </div>
  );
}
