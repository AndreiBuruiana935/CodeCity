"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { CitySchema, Building, OnboardingSummary, QuestionResponse, DistrictDetails } from "@/types/city";

interface CityHistoryItem {
  repoUrl: string;
  label: string;
  timestamp: number;
}

interface AppContextValue {
  // City data
  city: CitySchema | null;
  setCity: React.Dispatch<React.SetStateAction<CitySchema | null>>;
  onboarding: OnboardingSummary | null;
  setOnboarding: React.Dispatch<React.SetStateAction<OnboardingSummary | null>>;
  analystReport: Record<string, unknown> | null;
  setAnalystReport: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>;

  // Selection state
  selectedBuilding: Building | null;
  setSelectedBuilding: React.Dispatch<React.SetStateAction<Building | null>>;
  selectedDistrictId: string | null;
  setSelectedDistrictId: React.Dispatch<React.SetStateAction<string | null>>;
  highlightedBuildings: string[];
  setHighlightedBuildings: React.Dispatch<React.SetStateAction<string[]>>;
  cameraTarget: string | null;
  setCameraTarget: React.Dispatch<React.SetStateAction<string | null>>;
  summaryLoading: boolean;
  setSummaryLoading: React.Dispatch<React.SetStateAction<boolean>>;

  // UI state
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  showOnboarding: boolean;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  tourActive: boolean;
  setTourActive: React.Dispatch<React.SetStateAction<boolean>>;
  tourStep: number;
  setTourStep: React.Dispatch<React.SetStateAction<number>>;

  // Repo / analysis state
  repoUrl: string;
  setRepoUrl: React.Dispatch<React.SetStateAction<string>>;
  githubToken: string;
  setGithubToken: React.Dispatch<React.SetStateAction<string>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  loadingProgress: string;
  setLoadingProgress: React.Dispatch<React.SetStateAction<string>>;

  // History
  cityHistory: CityHistoryItem[];
  persistHistory: (history: CityHistoryItem[]) => void;
  rememberCity: (rawRepoUrl: string) => void;

  // Computed
  selectedDistrictDetails: DistrictDetails | null;

  // Handlers
  handleBuildingClick: (building: Building) => void;
  handleDistrictClick: (districtId: string) => void;
  handleQuestionAnswer: (response: QuestionResponse) => void;
  handleBuildingFocus: (buildingId: string) => void;
  flyToTransientTarget: (buildingId: string) => void;
  handleTourStart: () => void;
  handleTourNext: () => void;
  handleTourPrev: () => void;
  resetCity: () => void;
  softResetCity: () => void;
  analyzeRepo: (overrideRepoUrl?: string) => Promise<boolean>;
  isAnalyzing: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [city, setCity] = useState<CitySchema | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingSummary | null>(null);
  const [analystReport, setAnalystReport] = useState<Record<string, unknown> | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [highlightedBuildings, setHighlightedBuildings] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [cityHistory, setCityHistory] = useState<CityHistoryItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const transientCameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("codeatlas.repoHistory");
      if (!raw) return;
      const parsed = JSON.parse(raw) as CityHistoryItem[];
      if (Array.isArray(parsed)) {
        setCityHistory(parsed.slice(0, 12));
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      if (transientCameraTimeoutRef.current) {
        clearTimeout(transientCameraTimeoutRef.current);
      }
    };
  }, []);

  const persistHistory = useCallback((nextHistory: CityHistoryItem[]) => {
    setCityHistory(nextHistory);
    try {
      window.localStorage.setItem("codeatlas.repoHistory", JSON.stringify(nextHistory));
    } catch {
      // Ignore
    }
  }, []);

  const rememberCity = useCallback(
    (rawRepoUrl: string) => {
      const trimmed = rawRepoUrl.trim();
      if (!trimmed) return;
      const normalized = trimmed.replace(/\/$/, "");
      const label = normalized.replace(/^https?:\/\/github\.com\//i, "");
      const next = [
        { repoUrl: normalized, label, timestamp: Date.now() },
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

  const handleBuildingClick = useCallback((building: Building) => {
    setSelectedDistrictId(null);
    setSelectedBuilding(building);
    setCameraTarget(building.id);

    if (!building.aiSummary) {
      setSummaryLoading(true);
      fetch("/api/summarize-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.summary) {
            building.aiSummary = data.summary;
            setSelectedBuilding({ ...building, aiSummary: data.summary });
            setCity((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                city: {
                  ...prev.city,
                  districts: prev.city.districts.map((d) => ({
                    ...d,
                    buildings: d.buildings.map((b) =>
                      b.id === building.id ? { ...b, aiSummary: data.summary } : b
                    ),
                  })),
                },
              };
            });
          }
        })
        .catch(() => {})
        .finally(() => setSummaryLoading(false));
    }
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
    const subdistrictCount = city.city.districts.filter(
      (d) => d.name !== district.name && d.name.startsWith(`${district.name}/`)
    ).length;
    const topFiles = [...district.buildings]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5)
      .map((b) => b.path);
    const neighborhood =
      district.name === "." ? "root" : district.name.split("/").slice(0, -1).join("/") || "root";

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

  const analyzeRepo = useCallback(async (overrideRepoUrl?: string): Promise<boolean> => {
    const effectiveRepoUrl = (overrideRepoUrl || repoUrl).trim();
    if (!effectiveRepoUrl) return false;
    setError(null);
    setIsAnalyzing(true);
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
      setShowOnboarding(true);
      setIsAnalyzing(false);
      setLoadingProgress("");
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Analysis timed out after 120 seconds. Try a smaller repository.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      setIsAnalyzing(false);
      setLoadingProgress("");
      return false;
    }
  }, [repoUrl, githubToken, rememberCity]);

  const resetCity = useCallback(() => {
    setCity(null);
    setOnboarding(null);
    setAnalystReport(null);
    setSelectedBuilding(null);
    setSelectedDistrictId(null);
    setHighlightedBuildings([]);
    setCameraTarget(null);
    setSearchQuery("");
  }, []);

  const softResetCity = useCallback(() => {
    setCity(null);
    setOnboarding(null);
    setAnalystReport(null);
    setSelectedBuilding(null);
    setSelectedDistrictId(null);
    setHighlightedBuildings([]);
    setCameraTarget(null);
    setSearchQuery("");
    setError(null);
  }, []);

  const value: AppContextValue = {
    city, setCity,
    onboarding, setOnboarding,
    analystReport, setAnalystReport,
    selectedBuilding, setSelectedBuilding,
    selectedDistrictId, setSelectedDistrictId,
    highlightedBuildings, setHighlightedBuildings,
    cameraTarget, setCameraTarget,
    summaryLoading, setSummaryLoading,
    searchQuery, setSearchQuery,
    showOnboarding, setShowOnboarding,
    tourActive, setTourActive,
    tourStep, setTourStep,
    repoUrl, setRepoUrl,
    githubToken, setGithubToken,
    error, setError,
    loadingProgress, setLoadingProgress,
    cityHistory,
    persistHistory,
    rememberCity,
    selectedDistrictDetails,
    handleBuildingClick,
    handleDistrictClick,
    handleQuestionAnswer,
    handleBuildingFocus,
    flyToTransientTarget,
    handleTourStart,
    handleTourNext,
    handleTourPrev,
    resetCity,
    softResetCity,
    analyzeRepo,
    isAnalyzing,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
