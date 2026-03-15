"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/components/AppContext";
import dynamic from "next/dynamic";
import type { ArchSelection } from "@/components/ArchitectureMap";
import { classifyLayer, FILTER_BUTTONS, LAYERS } from "@/components/ArchitectureMap";
import { parseRepoUrl } from "@/lib/github";
import type { Building } from "@/types/city";

const ArchitectureMap = dynamic(() => import("@/components/ArchitectureMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-140 items-center justify-center rounded-xl bg-slate-950/80">
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
}

function DirTreeView({
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
              className="group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[12px] transition-colors hover:bg-white/5"
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
              <span className={`truncate ${isDir ? "font-medium text-slate-300" : "text-slate-500 group-hover:text-slate-300"}`}>
                {n.name}
              </span>
              {isDir && (
                <span className="ml-auto text-[10px] text-slate-600">{n.children.length}</span>
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
}

/* ── Collapsible accordion section ─────────────────────────── */
function AccordionSection({ id, label, open, onToggle, accent, children }: {
  id: string; label: string; open: boolean; onToggle: (id: string) => void;
  accent?: "orange"; children: React.ReactNode;
}) {
  const border = accent === "orange" ? "border-orange-400/25" : "border-slate-700/30";
  const bg = accent === "orange" ? "bg-orange-950/10" : "";
  const textColor = accent === "orange" ? "text-orange-300" : "text-cyan-200";
  return (
    <div className={`border-b ${border} ${bg}`}>
      <button type="button" onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-white/2">
        <svg className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${textColor}`}>{label}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
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
    softResetCity,
    analyzeRepo,
    onboarding,
  } = useAppContext();

  const [selected, setSelected] = useState<ArchSelection | null>(null);
  const [dirSidebarOpen, setDirSidebarOpen] = useState(true);
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const [stayOnPage, setStayOnPage] = useState(false);

  // Layer filter state (lifted from ArchitectureMap)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["all"]));

  // Bottom panel state
  const [expandedDep, setExpandedDep] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["summary"]));
  const toggleSection = useCallback((s: string) => setOpenSections(prev => {
    const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n;
  }), []);

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

  // Compute per-layer stats from city data
  const layerStats = useMemo(() => {
    if (!city) return null;
    const allBuildings = city.city.districts.flatMap((d) => d.buildings);
    const buildingLayer: Record<string, string> = {};
    const layerFiles: Record<string, typeof allBuildings> = { db: [], be: [], api: [], fe: [] };
    for (const b of allBuildings) {
      const layer = classifyLayer(b.path);
      buildingLayer[b.id] = layer;
      layerFiles[layer].push(b);
    }
    const cross: Record<string, Record<string, number>> = {};
    for (const key of ["db", "be", "api", "fe"]) cross[key] = { db: 0, be: 0, api: 0, fe: 0 };
    for (const road of city.city.roads) {
      const fl = buildingLayer[road.from];
      const tl = buildingLayer[road.to];
      if (fl && tl && fl !== tl) { cross[fl][tl]++; cross[tl][fl]++; }
    }
    return {
      layers: (["db", "be", "api", "fe"] as const).map((key) => ({
        key,
        name: LAYERS[key].name,
        color: `#${LAYERS[key].c.toString(16).padStart(6, "0")}`,
        fileCount: layerFiles[key].length,
        totalLoc: layerFiles[key].reduce((sum, b) => sum + b.linesOfCode, 0),
        connections: cross[key],
      })),
      totalFiles: allBuildings.length,
      totalConnections: city.city.roads.length,
    };
  }, [city]);

  // If nothing is loading and no city, redirect to landing (unless staying)
  useEffect(() => {
    if (!city && !isAnalyzing && !loadingProgress && !stayOnPage) {
      router.push("/");
    }
  }, [city, isAnalyzing, loadingProgress, router, stayOnPage]);

  // Redirect to landing on error (unless staying)
  useEffect(() => {
    if (error && !city && !stayOnPage) {
      router.push("/");
    }
  }, [error, city, router, stayOnPage]);

  // Re-analyze a new repo from within this page
  const handleReAnalyze = useCallback(async (newRepoUrl: string) => {
    setStayOnPage(true);
    setSelected(null);
    setChatMessages([{ role: "assistant", text: "Select a file and ask me anything about it, or ask about the overall architecture." }]);
    softResetCity();
    const success = await analyzeRepo(newRepoUrl);
    setStayOnPage(false);
    if (!success) {
      // stay on page showing error, don't redirect
    }
  }, [softResetCity, analyzeRepo]);

  const handleSelect = useCallback((sel: ArchSelection | null) => {
    setSelected(sel);
  }, []);

  // Clear expanded dep when selection changes
  useEffect(() => {
    setExpandedDep(null);
  }, [selected?.id]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, chatLoading]);



  // Resolve the full Building from city data for the selected node
  const selectedBuilding = useMemo<Building | null>(() => {
    if (!city || !selected) return null;
    return city.city.districts.flatMap(d => d.buildings).find(b => b.id === selected.id) ?? null;
  }, [city, selected]);

  // Build GitHub URL for "See Code"
  const githubFileUrl = useMemo(() => {
    if (!repoUrl || !selectedBuilding) return null;
    try {
      const { owner, repo } = parseRepoUrl(repoUrl);
      return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/main/${selectedBuilding.path}`;
    } catch { return null; }
  }, [repoUrl, selectedBuilding]);

  // Find road connections for a dependency
  const getDepConnections = useCallback((depPath: string) => {
    if (!city || !selectedBuilding) return [];
    const allBuildings = city.city.districts.flatMap(d => d.buildings);
    const depBuilding = allBuildings.find(b => b.path === depPath || b.filename === depPath || b.path.endsWith(`/${depPath}`));
    if (!depBuilding) return [];
    return city.city.roads.filter(
      r => (r.from === selectedBuilding.id && r.to === depBuilding.id) ||
           (r.to === selectedBuilding.id && r.from === depBuilding.id)
    ).map(r => ({ ...r, depBuilding }));
  }, [city, selectedBuilding]);

  // Chat submit handler
  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: "user", text: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const codeMap = city?.city.districts
        .flatMap(d => d.buildings.map(b => {
          const fns = b.functions.map(f => `${f.name}(${f.params.join(",")})`).join("; ");
          return `[${b.path}] LOC:${b.linesOfCode} risk:${b.riskScore} complexity:${b.complexity} deps:${b.dependencyCount}${fns ? ` fns:{${fns}}` : ""}${b.aiSummary ? ` — ${b.aiSummary}` : ""}`;
        })).join("\n") ?? "";

      const fileCtx = selectedBuilding
        ? `Currently viewing: ${selectedBuilding.path} (LOC:${selectedBuilding.linesOfCode}, risk:${selectedBuilding.riskScore}, complexity:${selectedBuilding.complexity}, deps:${selectedBuilding.dependencies.join(",")})`
        : "";

      const fullContext = [onboarding?.plainEnglish ?? "", "", "=== FILE MAP ===", codeMap, "", fileCtx].join("\n");

      const res = await fetch("http://localhost:3001/api/chat-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userQuery: userMsg.text, projectSummary: fullContext }),
      });
      const raw = await res.json();
      setChatMessages(prev => [...prev, { role: "assistant", text: raw.answer || raw.error || "No response." }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", text: "Failed to reach AI backend. Is the server running on port 3001?" }]);
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatInput, chatLoading, city, selectedBuilding, onboarding]);

  // Build directory tree from city data
  const dirTree = useMemo(() => {
    if (!city) return [] as DirTreeNode[];
    const allFiles = city.city.districts.flatMap((d) =>
      d.buildings.map((b) => ({ id: b.id, path: b.path, filename: b.filename }))
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
            ...(isLast ? { fileId: f.id } : {}),
          };
          cur.children.push(child);
        }
        if (isLast && !child.fileId) child.fileId = f.id;
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

  const layerColorMap: Record<string, string> = Object.fromEntries(
    Object.entries(LAYERS).map(([k, v]) => [v.name, `#${v.c.toString(16).padStart(6, "0")}`]),
  );

  // Which layers to show in the stats panel
  const visibleLayerStats = useMemo(() => {
    if (!layerStats) return [];
    if (activeFilters.has("all")) return layerStats.layers;
    return layerStats.layers.filter((l) => activeFilters.has(l.key));
  }, [layerStats, activeFilters]);

  // Loading screen
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
        <p className="text-sm text-gray-400">{loadingProgress}</p>
        <p className="mt-4 text-xs text-gray-600">
          Analyzing {repoUrl.replace("https://github.com/", "")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-y-auto bg-[#070d17] text-slate-100">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_12%_16%,rgba(80,200,255,0.2),transparent_42%),radial-gradient(circle_at_84%_10%,rgba(64,255,192,0.15),transparent_38%)]" />

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#070d17]/95 backdrop-blur-md">
      <div className="relative z-20 mx-auto w-full max-w-7xl px-6 py-8 pb-0 md:px-10 lg:px-14">
        <div className="mb-5 flex items-center justify-between border-b border-slate-700/40 pb-4">
          <div className="flex items-center gap-4">
            <h1 className="bg-linear-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
              Architecture Map
            </h1>
            <div className="hidden items-center gap-2 rounded-lg border border-slate-600/40 bg-slate-900/60 px-3 py-1.5 sm:inline-flex">
              {session?.user?.image && (
                <img src={session.user.image} alt="" className="h-6 w-6 rounded-full" />
              )}
              <span className="text-sm font-medium text-cyan-100">
                {city.city.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDirSidebarOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                dirSidebarOpen
                  ? "border-cyan-300/60 bg-slate-900/90 text-cyan-100"
                  : "border-slate-500/50 bg-slate-900/70 text-slate-200 hover:border-cyan-300/60 hover:text-cyan-100"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
              Files
            </button>
            {status === "authenticated" ? (
              <button
                type="button"
                onClick={() => { router.push("/projects"); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>
                Projects
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { resetCity(); router.push("/"); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
                Home
              </button>
            )}
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
      </div>

      {/* Layer filter row — full width, always stays in place */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-3 md:px-10 lg:px-14">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] text-slate-400">Layer:</span>
          {FILTER_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleFilter(btn.id)}
              className={`rounded-full border px-3.5 py-1 text-[11px] font-medium transition ${
                activeFilters.has(btn.id)
                  ? "border-cyan-300/60 bg-white text-slate-950 shadow-[0_0_10px_rgba(103,232,249,0.2)]"
                  : "border-slate-600/50 bg-transparent text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Main content */}
      <div className="relative flex flex-col">
        {/* Map + sidebar row */}
        <div className="relative flex h-[70vh]">
          {/* Architecture map — fills remaining space */}
          <div className="relative min-h-0 min-w-0 flex-1">
            <ArchitectureMap onSelect={handleSelect} city={city} highlightNodeId={highlightNodeId} onHighlightConsumed={() => setHighlightNodeId(null)} controlledFilters={activeFilters} />
          </div>

          {/* Right sidebar — always rendered, content slides between File Explorer and Layer Stats */}
          <div className="flex w-72 shrink-0 flex-col border-l border-white/8 bg-slate-950/80 backdrop-blur-xl">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {/* File Explorer panel — slides in from right */}
              <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${dirSidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
                  <svg className="h-4 w-4 text-cyan-400/80" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <h2 className="text-xs font-semibold tracking-wide text-slate-200">File Explorer</h2>
                </div>
                {/* File count */}
                <div className="border-b border-white/4 px-4 py-2">
                  <span className="text-[10px] text-slate-500">{city.city.districts.flatMap(d => d.buildings).length} files</span>
                </div>
                {/* Tree */}
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                  <DirTreeView nodes={dirTree} onSelectFile={(fileId) => {
                    const building = city.city.districts
                      .flatMap((d) => d.buildings)
                      .find((b) => b.id === fileId);
                    if (building) {
                      setSelected({
                        id: building.id,
                        label: building.filename,
                        layer: "frontend",
                        connectionCount: 0,
                        connectedTo: [],
                      });
                      setHighlightNodeId(fileId);
                    }
                  }} />
                </div>
              </div>

              {/* Layer Stats panel — slides in from left */}
              <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${dirSidebarOpen ? "-translate-x-full" : "translate-x-0"}`}>
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
                  <svg className="h-4 w-4 text-cyan-400/80" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                  <h2 className="text-xs font-semibold tracking-wide text-slate-200">Project Overview</h2>
                </div>
                {/* Summary */}
                <div className="border-b border-white/4 px-4 py-2">
                  <span className="text-[10px] text-slate-500">
                    {layerStats?.totalFiles ?? 0} files · {layerStats?.totalConnections ?? 0} connections
                  </span>
                </div>
                {/* Layer cards */}
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                  {visibleLayerStats.map((layer) => (
                    <div key={layer.key} className="rounded-xl border border-white/6 bg-white/2 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: layer.color }} />
                        <span className="text-xs font-semibold capitalize text-slate-200">{layer.name}</span>
                        <span className="ml-auto text-[10px] text-slate-500">{layer.fileCount} files</span>
                      </div>
                      <div className="mb-2 text-[10px] text-slate-500">{layer.totalLoc.toLocaleString()} lines of code</div>
                      {/* Connections to other layers */}
                      <div className="space-y-1.5">
                        {Object.entries(layer.connections)
                          .filter(([, count]) => count > 0)
                          .sort(([, a], [, b]) => b - a)
                          .map(([targetKey, count]) => (
                            <div key={targetKey} className="flex items-center gap-2 text-[10px]">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: `#${LAYERS[targetKey].c.toString(16).padStart(6, "0")}` }} />
                              <span className="capitalize text-slate-400">{LAYERS[targetKey].name}</span>
                              <div className="mx-1 h-px flex-1 bg-white/5" />
                              <span className="text-slate-500">{count}</span>
                            </div>
                          ))}
                        {Object.values(layer.connections).every((c) => c === 0) && (
                          <span className="text-[10px] text-slate-600">No cross-layer connections</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {visibleLayerStats.length === 0 && (
                    <p className="py-6 text-center text-[11px] text-slate-600">No layers selected</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Details + Chat panel — always visible */}
        {(() => {
          const b = selectedBuilding;
          const hasFile = selected && b;
          const maintainability = b ? (b.complexity > 12 ? "Low" : b.complexity > 7 ? "Medium" : "High") : "";
          const volatility = b ? (b.dependencyCount > 10 ? "High" : b.dependencyCount > 4 ? "Medium" : "Low") : "";
          const riskBarColor = b ? (b.riskScore > 60 ? "#f87171" : b.riskScore > 30 ? "#facc15" : "#4ade80") : "";
          const primaryAction = b ? (b.riskScore > 70
            ? "Refactor high-complexity paths and isolate dependencies."
            : b.riskScore > 40
            ? "Add tests around critical logic and monitor changes."
            : "Keep this file stable and document ownership.") : "";

          return (
            <div className="relative z-10 border-t border-slate-700/40 bg-slate-950/90 backdrop-blur-xl">
              {/* ── Compact header strip (only when file selected) ── */}
              {hasFile && b && (
                <>
                  <div className="flex items-center gap-3 border-b border-slate-700/30 px-5 py-3">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                    <h2 className="min-w-0 truncate font-mono text-sm text-slate-200">{b.path}</h2>
                    <span className="shrink-0 text-[10px] capitalize text-slate-500">{selected.layer}</span>
                    {b.entryPoint && <span className="shrink-0 rounded-full border border-blue-400/40 bg-blue-900/30 px-2 py-0.5 text-[10px] text-blue-200">Entry</span>}
                    {b.securitySensitive && <span className="shrink-0 rounded-full border border-purple-400/40 bg-purple-900/30 px-2 py-0.5 text-[10px] text-purple-200">Security</span>}
                    {b.readingListPriority < 999 && <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-900/20 px-2 py-0.5 text-[10px] text-cyan-200">Read #{b.readingListPriority}</span>}
                    <span className={`ml-auto shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold ${b.riskScore > 60 ? "border-red-500/40 bg-red-900/20 text-red-400" : b.riskScore > 30 ? "border-yellow-500/40 bg-yellow-900/20 text-yellow-400" : "border-green-500/40 bg-green-900/20 text-green-400"}`}>
                      Risk {b.riskScore}
                    </span>
                    {githubFileUrl && (
                      <a href={githubFileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-400/15">
                        GitHub
                      </a>
                    )}
                    <button onClick={() => setSelected(null)} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300">✕</button>
                  </div>

                  {/* ── Inline metrics bar ── */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-700/30 px-5 py-2">
                    {[
                      { label: "LOC", value: b.linesOfCode },
                      { label: "Complexity", value: b.complexity },
                      { label: "Deps", value: b.dependencyCount },
                      { label: "Functions", value: b.functions.length },
                    ].map(m => (
                      <div key={m.label} className="flex items-baseline gap-1.5">
                        <span className="text-[10px] text-slate-500">{m.label}</span>
                        <span className="text-sm font-bold text-white">{m.value}</span>
                      </div>
                    ))}
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] text-slate-500">Maintain.</span>
                      <span className={`text-sm font-semibold ${maintainability === "High" ? "text-green-400" : maintainability === "Medium" ? "text-yellow-400" : "text-red-400"}`}>{maintainability}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] text-slate-500">Volatility</span>
                      <span className={`text-sm font-semibold ${volatility === "Low" ? "text-green-400" : volatility === "Medium" ? "text-yellow-400" : "text-red-400"}`}>{volatility}</span>
                    </div>
                    <div className="ml-auto hidden items-center gap-2 sm:flex">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${b.riskScore}%`, backgroundColor: riskBarColor }} />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── Two-column body: details left | chat right ── */}
              <div className="flex" style={{ height: "420px" }}>
                {/* Left: file details or placeholder */}
                <div className="min-w-0 flex-1 overflow-y-auto border-r border-slate-700/30 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                  {hasFile && b ? (
                    <div className="space-y-px">
                      <AccordionSection id="summary" label="Summary" open={openSections.has("summary")} onToggle={toggleSection}>
                        <p className="text-xs leading-relaxed text-slate-300">{b.aiSummary || "No summary available."}</p>
                        <p className="mt-2 text-[11px] text-slate-400">{primaryAction}</p>
                      </AccordionSection>

                      {b.functions.length > 0 && (
                        <AccordionSection id="functions" label={`Functions (${b.functions.length})`} open={openSections.has("functions")} onToggle={toggleSection}>
                          <div className="space-y-1">
                            {b.functions.slice(0, 20).map((fn, i) => (
                              <div key={i} className="rounded-md border border-slate-700/50 bg-slate-900/70 px-2 py-1 font-mono text-[11px]">
                                <span className="text-slate-100">{fn.name}</span>
                                <span className="text-slate-500">({fn.params.join(", ")})</span>
                                <span className="ml-2 text-slate-600">L{fn.lines} · C{fn.complexity}</span>
                              </div>
                            ))}
                            {b.functions.length > 20 && <p className="text-[10px] text-slate-600">+{b.functions.length - 20} more</p>}
                          </div>
                        </AccordionSection>
                      )}

                      {b.dependencies.length > 0 && (
                        <AccordionSection id="deps" label={`Dependencies (${b.dependencyCount})`} open={openSections.has("deps")} onToggle={toggleSection}>
                          <div className="space-y-1">
                            {b.dependencies.map((dep, i) => {
                              const isExpanded = expandedDep === dep;
                              const connections = isExpanded ? getDepConnections(dep) : [];
                              return (
                                <div key={i}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDep(isExpanded ? null : dep)}
                                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left font-mono text-[11px] transition ${
                                      isExpanded ? "border-cyan-400/30 bg-cyan-900/15 text-cyan-200" : "border-slate-700/50 bg-slate-900/70 text-slate-300 hover:border-slate-600 hover:text-slate-100"
                                    }`}
                                  >
                                    <svg className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                    </svg>
                                    <span className="truncate">{dep}</span>
                                  </button>
                                  {isExpanded && (
                                    <div className="ml-5 mt-1 rounded-md border border-slate-700/40 bg-slate-900/40 p-2 text-[10px]">
                                      {connections.length > 0 ? connections.map((conn, ci) => (
                                        <div key={ci} className="flex items-center gap-2 py-0.5">
                                          <span className="text-slate-500">type:</span><span className="text-slate-300">{conn.type}</span>
                                          <span className="text-slate-500">weight:</span><span className="text-slate-300">{conn.weight}</span>
                                          <span className="text-slate-500">→</span><span className="truncate text-cyan-300">{conn.depBuilding.path}</span>
                                        </div>
                                      )) : <span className="text-slate-600">No direct road connections found.</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </AccordionSection>
                      )}

                      {b.aiWarnings.length > 0 && (
                        <AccordionSection id="warnings" label={`Warnings (${b.aiWarnings.length})`} open={openSections.has("warnings")} onToggle={toggleSection} accent="orange">
                          <ul className="space-y-1">
                            {b.aiWarnings.map((w, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-[11px] text-orange-200/85">
                                <span className="mt-0.5 text-orange-400">!</span>{w}
                              </li>
                            ))}
                          </ul>
                        </AccordionSection>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
                      <svg className="h-10 w-10 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-sm text-slate-500">Select a file on the map to see its details</p>
                      <p className="text-xs text-slate-600">Click any building or use the file explorer</p>
                    </div>
                  )}
                </div>

                {/* ── Right column: AI Chat (fixed height, scrollable inside) ── */}
                <div className="flex w-[38%] shrink-0 flex-col">
                  {/* Chat header */}
                  <div className="flex items-center gap-2.5 border-b border-slate-700/40 px-5 py-3">
                    <svg className="h-5 w-5 text-cyan-400/80" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                    <span className="text-sm font-semibold tracking-wide text-slate-200">AI Assistant</span>
                    {selectedBuilding && <span className="ml-auto truncate text-xs text-slate-500">{selectedBuilding.filename}</span>}
                  </div>

                  {/* Chat messages — scrollable within fixed container */}
                  <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
                        <div className="flex items-center gap-2.5 rounded-2xl bg-slate-800/60 px-4 py-3 text-sm text-slate-400">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/40 border-t-cyan-200" />
                          Thinking...
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat input */}
                  <form onSubmit={handleChatSubmit} className="flex items-center gap-3 border-t border-slate-700/40 px-5 py-3">
                    <input
                      ref={chatInputRef}
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={selectedBuilding ? "Ask about this file..." : "Ask about the architecture..."}
                      className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading || !chatInput.trim()}
                      className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:opacity-40"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
