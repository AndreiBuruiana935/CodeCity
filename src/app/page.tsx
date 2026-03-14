"use client";

import { useState, useCallback, Suspense, lazy, useRef, useEffect, useMemo } from "react";
import { CitySchema, Building, OnboardingSummary, QuestionResponse, DistrictDetails } from "@/types/city";
import { signIn, signOut, useSession } from "next-auth/react";
import SidePanel from "@/components/SidePanel";
import OnboardingOverlay from "@/components/OnboardingOverlay";
import QuestionBar from "@/components/QuestionBar";
import TourOverlay from "@/components/TourOverlay";
import Legend from "@/components/Legend";

const CityRenderer = lazy(() => import("@/components/CityRenderer"));

type AppState = "landing" | "loading" | "city";

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

export default function Home() {
  const { data: session, status } = useSession();
  const [state, setState] = useState<AppState>("landing");
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [repos, setRepos] = useState<UserRepo[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [city, setCity] = useState<CitySchema | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingSummary | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [highlightedBuildings, setHighlightedBuildings] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState("");
  const transientCameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      return;
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
  }, [status]);

  const filteredRepos = useMemo(() => {
    const term = repoSearch.trim().toLowerCase();
    if (!term) return repos.slice(0, 40);
    return repos
      .filter((repo) =>
        `${repo.fullName} ${repo.owner} ${repo.name}`.toLowerCase().includes(term)
      )
      .slice(0, 40);
  }, [repoSearch, repos]);

  const flyToTransientTarget = useCallback((buildingId: string) => {
    if (transientCameraTimeoutRef.current) {
      clearTimeout(transientCameraTimeoutRef.current);
    }

    setCameraTarget(buildingId);
    transientCameraTimeoutRef.current = setTimeout(() => {
      setCameraTarget((current) => (current === buildingId ? null : current));
    }, 1800);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!repoUrl.trim()) return;
    setState("loading");
    setError(null);
    setLoadingProgress("Fetching repository structure...");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          options: {
            depth: "full",
            includeTests: false,
            githubToken: githubToken || undefined,
            enableAI: true,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      setLoadingProgress("Generating city layout...");
      const data = await res.json();
      setCity(data.city);
      setOnboarding(data.onboarding);
      setState("city");
      setShowOnboarding(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("landing");
    }
  }, [repoUrl, githubToken]);

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
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#070d17] text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(80,200,255,0.22),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(73,134,255,0.25),transparent_42%),radial-gradient(circle_at_52%_82%,rgba(78,255,177,0.16),transparent_45%)]" />
        <div className="pointer-events-none absolute -left-28 top-14 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl animate-float-orb" />
        <div className="pointer-events-none absolute -right-24 top-28 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl animate-float-orb-delayed" />
        <div className="pointer-events-none absolute bottom-[-120px] left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl animate-float-orb" />
        <div className="landing-grid-overlay pointer-events-none absolute inset-0 opacity-60" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-10 pt-8 md:px-10 lg:px-14">
          <div className="animate-rise-in flex items-center justify-between">
            <div className="animate-fluid-gradient bg-gradient-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text pb-1 text-5xl font-extrabold leading-[1.12] tracking-tight text-transparent sm:text-6xl lg:text-7xl">
              Code City
            </div>
            {status === "authenticated" ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-300">
                  Signed in as {session?.user?.name || session?.user?.email || "GitHub user"}
                </span>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="rounded-lg border border-slate-500/40 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => signIn("github")}
                className="rounded-lg border border-cyan-300/40 bg-slate-900/70 px-3 py-1.5 text-xs text-cyan-100 transition hover:border-cyan-200/70 hover:bg-slate-900"
              >
                Sign in with GitHub
              </button>
            )}
          </div>

          <div className="mt-8 grid flex-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="animate-rise-in-delayed">
              <p className="mb-5 text-sm font-medium tracking-wide text-cyan-200/90">
                Understand architecture in minutes
              </p>
              <h1 className="max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Turn any repo into a
                <span className="animate-fluid-gradient bg-gradient-to-r from-cyan-300 via-blue-300 to-emerald-300 bg-clip-text text-transparent">
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

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAnalyze();
                  }}
                  className="space-y-4"
                >
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

                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold tracking-[0.13em] text-slate-300 uppercase">
                        Your GitHub Repositories
                      </p>
                      {status === "authenticated" && (
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
                                err instanceof Error
                                  ? err.message
                                  : "Failed to reload repositories"
                              );
                            } finally {
                              setRepoLoading(false);
                            }
                          }}
                          className="rounded-md border border-slate-500/35 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
                        >
                          Refresh
                        </button>
                      )}
                    </div>

                    {status !== "authenticated" ? (
                      <div className="rounded-lg border border-slate-700/50 bg-slate-950/60 p-3 text-xs text-slate-300">
                        Sign in with GitHub to browse repos you own or collaborate on.
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                          placeholder="Search repos"
                          className="mb-2 w-full rounded-lg border border-slate-600/50 bg-slate-900/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                        />

                        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                          {repoLoading && (
                            <div className="rounded-lg border border-slate-700/50 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                              Loading repositories...
                            </div>
                          )}

                          {!repoLoading && filteredRepos.length === 0 && (
                            <div className="rounded-lg border border-slate-700/50 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
                              No repositories found for this search.
                            </div>
                          )}

                          {!repoLoading &&
                            filteredRepos.map((repo) => {
                              const selected =
                                repoUrl.trim().toLowerCase() ===
                                `https://github.com/${repo.fullName}`.toLowerCase();

                              return (
                                <div
                                  key={repo.id}
                                  className={`rounded-lg border px-2.5 py-2 transition ${
                                    selected
                                      ? "border-cyan-300/55 bg-cyan-900/15"
                                      : "border-slate-700/60 bg-slate-950/60"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRepoUrl(`https://github.com/${repo.fullName}`)
                                      }
                                      className="min-w-0 text-left"
                                    >
                                      <p className="truncate text-xs font-semibold text-slate-100">
                                        {repo.fullName}
                                      </p>
                                      <p className="text-[11px] text-slate-400">
                                        {repo.private ? "Private" : "Public"} · {repo.role}
                                      </p>
                                    </button>
                                    <a
                                      href={repo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded-md border border-slate-500/35 px-2 py-1 text-[11px] text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
                                    >
                                      Open
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                        </div>

                        {repoError && (
                          <p className="mt-2 text-xs text-rose-300">{repoError}</p>
                        )}
                      </>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold tracking-[0.13em] text-slate-300 uppercase">
                      GitHub Token (optional override)
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

                  <button
                    type="submit"
                    className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
                    <span className="relative">Analyze Repository</span>
                  </button>

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
                </form>

                {error && (
                  <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
                    {error}
                  </div>
                )}

                <div className="mt-5 border-t border-slate-700/50 pt-4 text-xs text-slate-400">
                  No upload needed. Analysis runs directly from GitHub.
                </div>
              </div>
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
    <div className="h-screen w-screen relative">
      {/* 3D Canvas */}
      {city && (
        <Suspense
          fallback={
            <div className="h-screen flex items-center justify-center bg-[#0a0a1a]">
              <p className="text-gray-400">Loading 3D renderer...</p>
            </div>
          }
        >
          <CityRenderer
            city={city}
            highlightedBuildings={highlightedBuildings}
            cameraTarget={cameraTarget}
            detailSelectionTarget={selectedBuilding?.id || null}
            selectedDistrictId={selectedDistrictId}
            onDistrictClick={handleDistrictClick}
            onBuildingClick={handleBuildingClick}
          />
        </Suspense>
      )}

      {/* Top bar */}
      <div className="fixed left-0 right-0 top-0 z-20 border-b border-cyan-300/15 bg-slate-950/75 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-4">
            <h1 className="bg-gradient-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text text-xl font-bold text-transparent">
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowOnboarding(true)}
              className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            >
              Guide
            </button>
            <button
              onClick={handleTourStart}
              className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            >
              Tour
            </button>
            <button
              onClick={() => {
                setState("landing");
                setCity(null);
                setOnboarding(null);
                setSelectedBuilding(null);
                setSelectedDistrictId(null);
                setHighlightedBuildings([]);
                setCameraTarget(null);
              }}
              className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            >
              New
            </button>
          </div>
        </div>
      </div>

      <div
        className={`fixed top-20 z-20 space-y-3 transition-all duration-300 ${
          selectedBuilding ? "right-[436px]" : "right-6"
        }`}
      >
        {!selectedBuilding && (
          <div className="w-64 rounded-2xl border border-cyan-300/20 bg-slate-950/80 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
              Walking Mode
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              <div>Move: W A S D</div>
              <div>Vertical: Q / E</div>
              <div>Sprint: Hold Shift (ramps up)</div>
            </div>
          </div>
        )}

        {!selectedBuilding && <Legend className="w-64" />}
      </div>

      {/* Side panel */}
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
