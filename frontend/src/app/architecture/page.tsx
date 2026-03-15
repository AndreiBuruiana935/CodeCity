"use client";

import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/components/AppContext";
import OnboardingOverlay from "@/components/OnboardingOverlay";
import dynamic from "next/dynamic";
import type { ArchSelection } from "@/components/ArchitectureMap";
import { classifyLayer, FILTER_BUTTONS } from "@/components/ArchitectureMap";
import { parseRepoUrl } from "@/lib/github";
import type { Building } from "@/types/city";
import FileDetailCard from "@/components/FileDetailCard";

const ArchitectureMap = dynamic(() => import("@/components/ArchitectureMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-950/80">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-200" />
    </div>
  ),
});

/* ── Directory tree types & component ──────────────────────── */
interface DirTreeNode {
  name: string;
  path: string;
  children: DirTreeNode[];
  fileId?: string;
  riskScore?: number;
  linesOfCode?: number;
}

const DirTreeView = memo(function DirTreeView({
  nodes,
  onSelectFile,
  depth = 0,
}: {
  nodes: DirTreeNode[];
  onSelectFile: (fileId: string) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <ul className="space-y-0.5">
      {nodes.map((n) => {
        const isDir = n.children.length > 0;
        const open = !collapsed[n.path];
        return (
          <li key={n.path}>
            <button
              type="button"
              onClick={() => {
                if (isDir) {
                  setCollapsed((p) => ({ ...p, [n.path]: !p[n.path] }));
                } else if (n.fileId) {
                  onSelectFile(n.fileId);
                }
              }}
              className="group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors hover:bg-white/5"
              style={{ paddingLeft: `${depth * 14 + 10}px` }}
            >
              {isDir ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <svg
                    className={`h-3 w-3 text-slate-500 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </span>
              ) : (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <svg className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </span>
              )}
              {/* Risk dot for files */}
              {!isDir && n.riskScore !== undefined && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      n.riskScore > 60 ? "#f87171" : n.riskScore > 30 ? "#facc15" : "#4ade80",
                  }}
                />
              )}
              <span className={`min-w-0 truncate ${isDir ? "font-medium text-slate-300" : "text-slate-400 group-hover:text-slate-200"}`}>
                {n.name}
              </span>
              {/* LOC count for files */}
              {!isDir && n.linesOfCode !== undefined && (
                <span className="ml-auto shrink-0 text-[13px] tabular-nums text-slate-600">{n.linesOfCode}</span>
              )}
              {isDir && (
                <span className="ml-auto text-[13px] text-slate-600">{n.children.length}</span>
              )}
            </button>
            {isDir && open && (
              <DirTreeView nodes={n.children} onSelectFile={onSelectFile} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
});

/* ── Connection type filter buttons ─────────────────────────── */
const CONNECTION_FILTERS = [
  { id: "conn-all",         label: "All" },
  { id: "conn-import",      label: "Import" },
  { id: "conn-cross-layer", label: "Cross-layer" },
  { id: "conn-circular",    label: "Circular" },
  { id: "conn-type-import", label: "Type-import" },
] as const;

/* ── Risk gauge arc SVG ─────────────────────────────────────── */
function RiskGaugeArc({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -220;
  const totalAngle = 260;
  const endAngle = startAngle + (totalAngle * Math.min(score, 100)) / 100;

  const polarToCartesian = (angle: number) => {
    const rad = (Math.PI / 180) * angle;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  const bgEnd = polarToCartesian(startAngle + totalAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const bgLargeArc = totalAngle > 180 ? 1 : 0;

  const color = score > 60 ? "#f87171" : score > 30 ? "#facc15" : "#4ade80";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {/* Background track */}
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${bgLargeArc} 1 ${bgEnd.x} ${bgEnd.y}`}
        fill="none" stroke="white" strokeOpacity={0.06} strokeWidth={3} strokeLinecap="round"
      />
      {/* Filled arc */}
      {score > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        />
      )}
      {/* Center text */}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
        className="text-[13px] font-bold" fill={color}>{Math.round(score)}</text>
    </svg>
  );
}

export default function ArchitecturePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    city,
    repoUrl,
    loadingProgress,
    error,
    isAnalyzing,
    resetCity,
    onboarding,
    tourActive,
    tourStep,
    handleTourStart,
    handleTourNext,
    handleTourPrev,
    setTourActive,
  } = useAppContext();

  const [selected, setSelected] = useState<ArchSelection | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"files" | "reading">("files");
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const [stayOnPage] = useState(false);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  useEffect(() => {
    if (onboarding?.plainEnglish) {
      setShowSummaryPopup(true);
    }
  }, [onboarding?.plainEnglish]);

  // Layer filter state
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["all"]));

  // Chat state
  interface ChatMsg { role: "user" | "assistant"; text: string }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "assistant", text: "Select a file and ask me anything about it, or ask about the overall architecture." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const handleFilter = useCallback((id: string) => {
    setActiveFilters((prev) => {
      let next: Set<string>;
      if (id === "all") {
        next = new Set(["all"]);
      } else {
        next = new Set(prev);
        next.delete("all");
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (next.size === 0 || next.size === 4) next = new Set(["all"]);
      }
      return next;
    });
  }, []);

  // If nothing is loading and no city, redirect to landing
  useEffect(() => {
    if (!city && !isAnalyzing && !loadingProgress && !stayOnPage) {
      router.push("/");
    }
  }, [city, isAnalyzing, loadingProgress, router, stayOnPage]);

  useEffect(() => {
    if (error && !city && !stayOnPage) {
      router.push("/");
    }
  }, [error, city, router, stayOnPage]);

  const handleSelect = useCallback((sel: ArchSelection | null) => {
    setSelected(sel);
    if (sel) setRightDrawerOpen(true);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, chatLoading]);

  // Sync tour step → highlight
  useEffect(() => {
    if (!tourActive || !onboarding?.guidedTour) return;
    const step = onboarding.guidedTour[tourStep];
    if (step?.buildingId) {
      setHighlightNodeId(step.buildingId);
    }
  }, [tourActive, tourStep, onboarding]);

  // Resolve selected building
  const allBuildings = useMemo(() => {
    if (!city) return [];
    return city.city.districts.flatMap(d => d.buildings);
  }, [city]);

  // Average LOC across all buildings (for FileDetailCard relative bar)
  const repoAvgLoc = useMemo(() => {
    if (allBuildings.length === 0) return 0;
    return allBuildings.reduce((sum, b) => sum + b.linesOfCode, 0) / allBuildings.length;
  }, [allBuildings]);

  const selectedBuilding = useMemo<Building | null>(() => {
    if (!selected) return null;
    return allBuildings.find(b => b.id === selected.id) ?? null;
  }, [allBuildings, selected]);

  // Enriched stats
  const selectedStats = useMemo(() => {
    if (!city || !selectedBuilding) return null;
    const roads = city.city.roads;
    const fanIn = roads.filter(r => r.to === selectedBuilding.id).length;
    const fanOut = roads.filter(r => r.from === selectedBuilding.id).length;
    const isOrphan = fanIn === 0 && fanOut === 0;
    const isHotspot = (city.city.hotspots ?? []).includes(selectedBuilding.id);
    const isEntry = selectedBuilding.entryPoint || (city.city.entryPoints ?? []).includes(selectedBuilding.id);
    const outTargets = roads.filter(r => r.from === selectedBuilding.id).map(r => r.to);
    const inSources = roads.filter(r => r.to === selectedBuilding.id).map(r => r.from);
    const circularWith = outTargets.filter(t => inSources.includes(t));
    const circularNames = circularWith.map(cid => allBuildings.find(b => b.id === cid)?.filename).filter(Boolean) as string[];
    return { fanIn, fanOut, isOrphan, isHotspot, isEntry, circularWith, circularNames };
  }, [city, selectedBuilding, allBuildings]);

  // GitHub URL
  const githubFileUrl = useMemo(() => {
    if (!repoUrl || !selectedBuilding) return null;
    try {
      const { owner, repo } = parseRepoUrl(repoUrl);
      return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/main/${selectedBuilding.path}`;
    } catch { return null; }
  }, [repoUrl, selectedBuilding]);

  // Chat submit
  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: "user", text: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const conversationHistory = chatMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }));

      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMsg.text,
          city,
          onboarding,
          messages: conversationHistory,
        }),
      });
      const raw = await res.json();
      setChatMessages(prev => [...prev, { role: "assistant", text: raw.answer || raw.error || "No response." }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", text: "Failed to reach AI backend." }]);
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatInput, chatLoading, city, selectedBuilding, onboarding, chatMessages]);

  // Build directory tree with risk + LOC data
  const dirTree = useMemo(() => {
    if (!city) return [] as DirTreeNode[];
    const allFiles = city.city.districts.flatMap((d) =>
      d.buildings.map((b) => ({ id: b.id, path: b.path, filename: b.filename, riskScore: b.riskScore, linesOfCode: b.linesOfCode }))
    );
    const root: DirTreeNode = { name: "", path: "", children: [] };
    for (const f of allFiles) {
      const parts = f.path.split("/").filter(Boolean);
      let cur = root;
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        let child = cur.children.find((c) => c.name === parts[i]);
        if (!child) {
          child = {
            name: parts[i],
            path: parts.slice(0, i + 1).join("/"),
            children: [],
            ...(isLast ? { fileId: f.id, riskScore: f.riskScore, linesOfCode: f.linesOfCode } : {}),
          };
          cur.children.push(child);
        }
        if (isLast && !child.fileId) {
          child.fileId = f.id;
          child.riskScore = f.riskScore;
          child.linesOfCode = f.linesOfCode;
        }
        cur = child;
      }
    }
    function sortTree(node: DirTreeNode) {
      node.children.sort((a, b) => {
        const aDir = a.children.length > 0 ? 0 : 1;
        const bDir = b.children.length > 0 ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    }
    sortTree(root);
    return root.children;
  }, [city]);

  // Compute average risk
  const avgRisk = useMemo(() => {
    if (allBuildings.length === 0) return 0;
    return allBuildings.reduce((sum, b) => sum + b.riskScore, 0) / allBuildings.length;
  }, [allBuildings]);

  // Parse repo name
  const repoParts = useMemo(() => {
    if (!repoUrl) return null;
    try {
      return parseRepoUrl(repoUrl);
    } catch { return null; }
  }, [repoUrl]);

  // GitHub repo link
  const githubRepoUrl = useMemo(() => {
    if (!repoParts) return null;
    return `https://github.com/${repoParts.owner}/${repoParts.repo}`;
  }, [repoParts]);

  // Global search results
  const searchResults = useMemo(() => {
    if (!globalSearch.trim() || !city) return [];
    const q = globalSearch.toLowerCase();
    return allBuildings
      .filter(b => b.filename.toLowerCase().includes(q) || b.path.toLowerCase().includes(q) || (b.aiSummary && b.aiSummary.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [globalSearch, city, allBuildings]);

  // Reading list (top 5)
  const readingList = useMemo(() => {
    if (!onboarding?.readingList) return [];
    return onboarding.readingList.slice(0, 5);
  }, [onboarding]);

  // Select a building helper
  const selectBuildingById = useCallback((buildingId: string) => {
    const building = allBuildings.find((b) => b.id === buildingId);
    if (building) {
      setSelected({
        id: building.id,
        label: building.filename,
        layer: classifyLayer(building.path, building.architecturalRole, building.aiLayer),
        connectionCount: 0,
        connectedTo: [],
      });
      setHighlightNodeId(buildingId);
    }
  }, [allBuildings]);

  /* ── Loading screen ─────────────────────────────────────────── */
  if (!city) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a1a]">
        <div className="relative mb-8">
          <div className="h-20 w-20 animate-spin rounded-full border-2 border-indigo-600/30" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-3 w-3 animate-pulse rounded-full bg-indigo-500" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-white">
          Building your architecture graph...
        </h2>
        <p className="text-[14px] text-gray-400">{loadingProgress}</p>
        <p className="mt-4 text-[13px] text-gray-600">
          Analyzing {repoUrl.replace("https://github.com/", "")}
        </p>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     MAIN THREE-ZONE LAYOUT
     ════════════════════════════════════════════════════════════════ */
  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#070d17] text-slate-100">
      {/* Ambient gradient */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_12%_16%,rgba(80,200,255,0.12),transparent_42%),radial-gradient(circle_at_84%_10%,rgba(64,255,192,0.08),transparent_38%)]" />

      {/* ═══════════════════════════════════════════════════════════
          TOP BAR — 48px
          ═══════════════════════════════════════════════════════════ */}
      <header className="relative z-30 flex h-12 shrink-0 items-center gap-4 border-b border-white/6 bg-[#070d17]/95 px-4 backdrop-blur-md">
        {/* Left: wordmark + breadcrumb */}
        <div className="flex items-center gap-3">
          <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-emerald-300 bg-clip-text text-[15px] font-extrabold tracking-tight text-transparent">
            CodeAtlas
          </span>
          {repoParts && (
            <span className="hidden text-[13px] text-slate-500 sm:inline">
              {repoParts.owner} / <span className="text-slate-300">{repoParts.repo}</span>
            </span>
          )}
        </div>

        {/* Center: global search */}
        <div className="relative mx-auto w-full max-w-md">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search files and summaries..."
            className="w-full rounded-lg border border-white/8 bg-white/4 py-1.5 pl-9 pr-3 text-[13px] text-slate-200 placeholder-slate-500 outline-none transition focus:border-cyan-400/40 focus:bg-white/6"
          />
          {/* Search dropdown */}
          {globalSearch.trim() && searchResults.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur-xl">
              {searchResults.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    selectBuildingById(b.id);
                    setGlobalSearch("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/5"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: b.riskScore > 60 ? "#f87171" : b.riskScore > 30 ? "#facc15" : "#4ade80" }}
                  />
                  <span className="min-w-0 truncate text-[13px] text-slate-200">{b.path}</span>
                  <span className="ml-auto shrink-0 text-[13px] text-slate-600">{b.linesOfCode} LOC</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {onboarding?.guidedTour && onboarding.guidedTour.length > 0 && !tourActive && (
            <button
              type="button"
              onClick={handleTourStart}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-900/25 px-3 py-1 text-[13px] font-medium text-emerald-200 transition hover:border-emerald-300/60"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>
              Tour
            </button>
          )}
          {githubRepoUrl && (
            <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 text-slate-400 transition hover:border-white/15 hover:text-white">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
            </a>
          )}
          {session?.user?.image && (
            <img src={session.user.image} alt="" className="h-7 w-7 rounded-full border border-white/10" />
          )}
          {status === "authenticated" ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="text-[13px] text-slate-500 transition hover:text-slate-300"
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { resetCity(); router.push("/"); }}
              className="text-[13px] text-slate-500 transition hover:text-slate-300"
            >
              Home
            </button>
          )}
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════
          BODY — fills remaining height
          ═══════════════════════════════════════════════════════════ */}
      <div className="relative z-10 flex min-h-0 flex-1">

        {/* ─── LEFT SIDEBAR ───────────────────────────────────── */}
        <aside
          className="relative z-20 flex shrink-0 flex-col border-r border-white/6 bg-slate-950/90 backdrop-blur-xl transition-[width] duration-300 ease-in-out"
          style={{ width: leftSidebarOpen ? 320 : 48 }}
        >
          {/* Collapsed icon rail */}
          {!leftSidebarOpen && (
            <div className="flex flex-col items-center gap-1 pt-3">
              <button
                type="button" onClick={() => { setLeftSidebarOpen(true); setSidebarTab("files"); }}
                title="File Explorer"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </button>
              <button
                type="button" onClick={() => { setLeftSidebarOpen(true); setSidebarTab("reading"); }}
                title="Reading List"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </button>
              <div title={`Avg Risk: ${Math.round(avgRisk)}`} className="mt-1">
                <RiskGaugeArc score={avgRisk} size={36} />
              </div>
            </div>
          )}

          {/* Expanded sidebar content */}
          {leftSidebarOpen && (
            <>
              {/* Zone A top: repo info + risk gauge */}
              <div className="flex items-center gap-3 border-b border-white/6 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[14px] font-semibold text-white">{city.city.name}</h2>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded border border-cyan-400/30 bg-cyan-900/20 px-1.5 py-0.5 text-[13px] font-medium text-cyan-300">
                      {city.city.language}
                    </span>
                    {city.city.framework && (
                      <span className="rounded border border-emerald-400/30 bg-emerald-900/20 px-1.5 py-0.5 text-[13px] font-medium text-emerald-300">
                        {city.city.framework}
                      </span>
                    )}
                  </div>
                </div>
                <RiskGaugeArc score={avgRisk} size={48} />
                <button
                  type="button"
                  onClick={() => setLeftSidebarOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
              </div>

              {/* Tab bar: Files / Reading */}
              <div className="flex border-b border-white/6">
                <button
                  type="button"
                  onClick={() => setSidebarTab("files")}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium transition ${
                    sidebarTab === "files"
                      ? "border-b-2 border-cyan-400 text-cyan-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  Files
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab("reading")}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium transition ${
                    sidebarTab === "reading"
                      ? "border-b-2 border-amber-400 text-amber-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  Reading
                  {readingList.length > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[13px] font-bold text-amber-300">{readingList.length}</span>
                  )}
                </button>
              </div>

              {/* Zone A mid: scrollable file explorer tree */}
              {sidebarTab === "files" && (
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                  <div className="mb-1 px-2 text-[13px] text-slate-600">{allBuildings.length} files</div>
                  <DirTreeView
                    nodes={dirTree}
                    onSelectFile={(fileId) => selectBuildingById(fileId)}
                  />
                </div>
              )}

              {/* Zone A mid (alt): reading list */}
              {sidebarTab === "reading" && (
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                  {readingList.length > 0 ? (
                    <div className="space-y-1.5">
                      {readingList.map((item, i) => {
                        const isActive = selectedBuilding?.id === item.buildingId;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => selectBuildingById(item.buildingId)}
                            className={`group flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                              isActive
                                ? "border-amber-400/40 bg-amber-900/20"
                                : "border-white/5 bg-white/2 hover:border-white/10 hover:bg-white/4"
                            }`}
                          >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[13px] font-bold text-amber-300">
                              {item.priority}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-slate-200 group-hover:text-white">
                                {item.file.split("/").pop()}
                              </p>
                              <p className="truncate text-[13px] text-slate-500">
                                {item.file}
                              </p>
                              <p className="mt-1 text-[13px] leading-snug text-slate-400">
                                {item.reason}
                              </p>
                              <span className="mt-1 inline-block rounded bg-slate-800/60 px-1.5 py-0.5 text-[13px] text-slate-500">
                                ~{item.estimatedMinutes} min read
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
                      <svg className="h-8 w-8 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                      <p className="text-center text-[13px] text-slate-600">No reading list available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Zone A bottom: pinned reading list (always visible when on files tab) */}
              {sidebarTab === "files" && readingList.length > 0 && (
                <div className="shrink-0 border-t border-white/6 px-3 py-2">
                  <div className="mb-1.5 text-[13px] font-medium text-slate-500">Start reading</div>
                  {readingList.slice(0, 3).map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectBuildingById(item.buildingId)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-white/5"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[13px] font-bold text-amber-300">
                        {item.priority}
                      </span>
                      <span className="min-w-0 truncate text-[13px] text-slate-400">{item.file.split("/").pop()}</span>
                      <span className="ml-auto shrink-0 text-[13px] text-slate-600">~{item.estimatedMinutes}m</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>

        {/* ─── CENTER: 3D Canvas ──────────────────────────────── */}
        <main className="relative min-h-0 min-w-0 flex-1">
          {/* Three.js fills this entirely */}
          <div className="h-full w-full">
            <ArchitectureMap
              onSelect={handleSelect}
              city={city}
              highlightNodeId={highlightNodeId}
              onHighlightConsumed={() => setHighlightNodeId(null)}
              controlledFilters={activeFilters}
            />
          </div>

          {/* ── Floating HUD: bottom-left ──────────────────── */}
          <div className="pointer-events-auto absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 backdrop-blur-xl">
            {/* Layer filters */}
            {FILTER_BUTTONS.map((btn) => (
              <button
                key={btn.id}
                onClick={() => handleFilter(btn.id)}
                className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium transition ${
                  activeFilters.has(btn.id)
                    ? "bg-white/15 text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {btn.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            {/* Connection type filters (placeholder — wired in Step 3) */}
            {CONNECTION_FILTERS.slice(0, 3).map((btn) => (
              <button
                key={btn.id}
                className="rounded-full px-2 py-0.5 text-[13px] text-slate-600 transition hover:text-slate-400"
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Minimap is now rendered inside ArchitectureMap (bottom-right) */}

          {/* ── Guided Tour Overlay ── */}
          {tourActive && onboarding?.guidedTour && onboarding.guidedTour.length > 0 && (() => {
            const step = onboarding.guidedTour[tourStep];
            if (!step) return null;
            const total = onboarding.guidedTour.length;
            const isFirst = tourStep === 0;
            const isLast = tourStep === total - 1;
            return (
              <div className="pointer-events-none absolute inset-0 z-20">
                <div className="pointer-events-auto absolute bottom-16 left-3 w-80 rounded-2xl border border-emerald-400/30 bg-slate-950/95 p-5 shadow-2xl shadow-emerald-900/20 backdrop-blur-xl">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: total }).map((_, i) => (
                        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === tourStep ? "w-6 bg-emerald-400" : "w-1.5 bg-slate-600"}`} />
                      ))}
                    </div>
                    <span className="ml-auto text-[13px] text-slate-500">{tourStep + 1}/{total}</span>
                    <button onClick={() => setTourActive(false)} className="rounded-md p-0.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <h3 className="mb-1 text-[14px] font-bold text-emerald-300">{step.label}</h3>
                  <p className="mb-2 truncate text-[13px] text-slate-400">{step.file}</p>
                  <p className="mb-4 text-[13px] leading-relaxed text-slate-300">{step.description}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTourPrev}
                      disabled={isFirst}
                      className="rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-1.5 text-[13px] font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-30"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => selectBuildingById(step.buildingId)}
                      className="rounded-lg border border-cyan-400/30 bg-cyan-900/20 px-3 py-1.5 text-[13px] font-medium text-cyan-200 transition hover:border-cyan-300/50"
                    >
                      View File
                    </button>
                    {isLast ? (
                      <button
                        onClick={() => setTourActive(false)}
                        className="ml-auto rounded-lg border border-emerald-400/50 bg-emerald-900/30 px-3 py-1.5 text-[13px] font-bold text-emerald-200 transition hover:border-emerald-300/70"
                      >
                        Finish
                      </button>
                    ) : (
                      <button
                        onClick={handleTourNext}
                        className="ml-auto rounded-lg border border-emerald-400/50 bg-emerald-900/30 px-3 py-1.5 text-[13px] font-bold text-emerald-200 transition hover:border-emerald-300/70"
                      >
                        Next
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </main>

        {/* ─── RIGHT DRAWER TAB (visible when drawer is closed) ─ */}
        {!rightDrawerOpen && (
          <button
            type="button"
            onClick={() => setRightDrawerOpen(true)}
            className="absolute right-0 top-1/2 z-30 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-slate-950/80 text-slate-500 backdrop-blur-xl transition hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        {/* ─── RIGHT DETAIL DRAWER ─────────────────────────────── */}
        {rightDrawerOpen && (
          <aside
            className="relative z-20 flex w-[400px] shrink-0 flex-col border-l border-white/6 bg-slate-950/90 backdrop-blur-xl"
          >
            {/* Drawer close tab */}
            <button
              type="button"
              onClick={() => setRightDrawerOpen(false)}
              className="absolute -left-6 top-1/2 z-30 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-slate-950/80 text-slate-500 backdrop-blur-xl transition hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            {selected && selectedBuilding ? (
              <>
                {/* ─── TOP PANE: File Detail (60%) ─── */}
                <div className="min-h-0 flex-[6] overflow-y-auto border-b border-white/6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                  <FileDetailCard
                    building={selectedBuilding}
                    stats={selectedStats!}
                    allBuildings={allBuildings}
                    githubFileUrl={githubFileUrl}
                    repoAvgLoc={repoAvgLoc}
                    onSelectBuilding={selectBuildingById}
                    onClose={() => setSelected(null)}
                  />
                </div>

                {/* ─── BOTTOM PANE: AI Chat (40%) ─── */}
                <div className="flex min-h-0 flex-[4] flex-col">
                  <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2">
                    <svg className="h-4 w-4 text-cyan-400/80" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                    <span className="text-[13px] font-semibold text-slate-200">AI Assistant</span>
                    <span className="ml-auto truncate text-[13px] text-slate-500">{selectedBuilding.filename}</span>
                  </div>
                  <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto space-y-3 px-4 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-[14px] leading-relaxed ${
                          msg.role === "user"
                            ? "bg-cyan-500/15 text-cyan-100"
                            : "bg-slate-800/60 text-slate-300"
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2 rounded-2xl bg-slate-800/60 px-3 py-2.5 text-[14px] text-slate-400">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/40 border-t-cyan-200" />
                          Thinking...
                        </div>
                      </div>
                    )}
                  </div>
                  <form onSubmit={handleChatSubmit} className="flex items-center gap-2 border-t border-white/6 px-4 py-2">
                    <input
                      ref={chatInputRef}
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask about this file..."
                      className="min-w-0 flex-1 rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-[14px] text-slate-200 placeholder-slate-500 outline-none transition focus:border-cyan-400/40"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading || !chatInput.trim()}
                      className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-[13px] font-semibold text-cyan-100 transition hover:border-cyan-300/60 disabled:opacity-40"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </>
            ) : (
              /* ─── No file selected: full-height AI Chat ─── */
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2">
                  <svg className="h-4 w-4 text-cyan-400/80" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                  <span className="text-[13px] font-semibold text-slate-200">AI Assistant</span>
                </div>
                <div ref={!selected ? chatScrollRef : undefined} className="min-h-0 flex-1 overflow-y-auto space-y-3 px-4 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-[14px] leading-relaxed ${
                        msg.role === "user"
                          ? "bg-cyan-500/15 text-cyan-100"
                          : "bg-slate-800/60 text-slate-300"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 rounded-2xl bg-slate-800/60 px-3 py-2.5 text-[14px] text-slate-400">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/40 border-t-cyan-200" />
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
                <form onSubmit={handleChatSubmit} className="flex items-center gap-2 border-t border-white/6 px-4 py-2">
                  <input
                    ref={!selected ? chatInputRef : undefined}
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about the architecture..."
                    className="min-w-0 flex-1 rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-[14px] text-slate-200 placeholder-slate-500 outline-none transition focus:border-cyan-400/40"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-[13px] font-semibold text-cyan-100 transition hover:border-cyan-300/60 disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Onboarding Overlay ── */}
      {onboarding?.plainEnglish && showSummaryPopup && (
        <OnboardingOverlay
          onboarding={onboarding}
          onClose={() => setShowSummaryPopup(false)}
          onTourStart={() => {
            setShowSummaryPopup(false);
            handleTourStart();
          }}
          onBuildingFocus={(buildingId) => {
            setShowSummaryPopup(false);
            setHighlightNodeId(buildingId);
          }}
        />
      )}
    </div>
  );
}
