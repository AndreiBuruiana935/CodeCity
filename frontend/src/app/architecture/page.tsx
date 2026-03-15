"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/components/AppContext";
import dynamic from "next/dynamic";
import type { ArchSelection } from "@/components/ArchitectureMap";

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
    <ul className="space-y-px">
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
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition hover:bg-slate-800/60"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {isDir ? (
                <svg
                  className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              ) : (
                <svg className="h-3 w-3 shrink-0 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              )}
              <span className={`truncate ${isDir ? "font-medium text-slate-300" : "text-slate-400"}`}>
                {n.name}
              </span>
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
  } = useAppContext();

  const [selected, setSelected] = useState<ArchSelection | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [dirSidebarOpen, setDirSidebarOpen] = useState(true);
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);

  // If nothing is loading and no city, redirect to landing
  useEffect(() => {
    if (!city && !isAnalyzing && !loadingProgress) {
      router.push("/");
    }
  }, [city, isAnalyzing, loadingProgress, router]);

  // Redirect to landing on error
  useEffect(() => {
    if (error && !city) {
      router.push("/");
    }
  }, [error, city, router]);

  // Clear AI response when selection changes
  useEffect(() => {
    setAiResponse(null);
  }, [selected?.id]);

  const handleSelect = useCallback((sel: ArchSelection | null) => {
    setSelected(sel);
  }, []);

  const handleAskAI = useCallback(async () => {
    if (!selected) return;
    setAiResponse(null);
    setAiLoading(true);
    const prompt = `In this codebase "${city?.city.name || "unknown"}", explain what "${selected.label}" (${selected.layer} layer) does and how its ${selected.connectionCount} connections fit into the overall architecture. Connected to: ${selected.connectedTo.join(", ") || "none"}.`;
    try {
      const res = await fetch("http://localhost:3001/api/chat-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: prompt,
          context: `The user is exploring the architecture graph of "${city?.city.name || "a repository"}". They selected the "${selected.label}" node in the ${selected.layer} layer which has ${selected.connectionCount} connections. Explain its role.`,
          history: [],
        }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const data = await res.json();
      setAiResponse(data.answer || data.message || "No response from AI.");
    } catch {
      setAiResponse("Could not reach the AI backend. Make sure the backend server is running on port 3001.");
    } finally {
      setAiLoading(false);
    }
  }, [selected, city]);

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

  const layerColors: Record<string, string> = {
    database: "#BA7517",
    backend: "#1D9E75",
    api: "#7F77DD",
    frontend: "#D85A30",
  };

  return (
    <div className="relative flex h-screen w-screen flex-col bg-[#070d17] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(80,200,255,0.2),transparent_42%),radial-gradient(circle_at_84%_10%,rgba(64,255,192,0.15),transparent_38%)]" />

      {/* Top bar — same structure as Projects Workspace */}
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
              Files
            </button>
            {status === "authenticated" ? (
              <button
                type="button"
                onClick={() => {
                  router.push("/projects");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500/50 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>
                Projects
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  resetCity();
                  router.push("/");
                }}
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

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Directory sidebar */}
        {dirSidebarOpen && (
          <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-700/40 bg-slate-950/90 backdrop-blur-xl">
            <div className="px-4 py-3 border-b border-slate-700/40">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">File Explorer</h2>
            </div>
            <div className="px-2 py-2">
              <DirTreeView nodes={dirTree} onSelectFile={(fileId) => {
                // Find the building and trigger the select callback
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
                  // Trigger the ArchitectureMap to highlight this node externally
                  setHighlightNodeId(fileId);
                }
              }} />
            </div>
          </div>
        )}

        {/* Architecture map */}
        <div className="relative min-w-0 flex-1 overflow-auto px-5 py-4">
          <ArchitectureMap onSelect={handleSelect} city={city} highlightNodeId={highlightNodeId} onHighlightConsumed={() => setHighlightNodeId(null)} />
        </div>

        {/* Side panel */}
        {selected && (
          <div className="w-80 shrink-0 overflow-y-auto border-l border-cyan-300/15 bg-slate-950/90 backdrop-blur-xl">
            <div className="flex flex-col gap-0">
              {/* Header */}
              <div className="border-b border-slate-700/50 px-5 py-4">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">{selected.label}</h2>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-md px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: layerColors[selected.layer] || "#7F77DD" }}
                  />
                  <span className="text-xs capitalize text-slate-400">{selected.layer} layer</span>
                </div>
              </div>

              {/* Stats */}
              <div className="border-b border-slate-700/50 px-5 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 px-3 py-2.5">
                    <div className="text-lg font-semibold text-cyan-200">{selected.connectionCount}</div>
                    <div className="text-[10px] text-slate-500">Connections</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 px-3 py-2.5">
                    <div className="text-lg font-semibold text-emerald-200">{selected.connectedTo.length}</div>
                    <div className="text-[10px] text-slate-500">Linked Nodes</div>
                  </div>
                </div>
              </div>

              {/* Connected nodes */}
              {selected.connectedTo.length > 0 && (
                <div className="border-b border-slate-700/50 px-5 py-4">
                  <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Connected To
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.connectedTo.map((name) => (
                      <span
                        key={name}
                        className="rounded-md border border-slate-700/50 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-300"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ask AI */}
              <div className="px-5 py-4">
                <button
                  onClick={handleAskAI}
                  disabled={aiLoading}
                  className="w-full rounded-lg border border-cyan-300/30 bg-linear-to-r from-cyan-400/15 to-blue-500/15 px-4 py-2.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:from-cyan-400/25 hover:to-blue-500/25 disabled:opacity-50"
                >
                  {aiLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border border-cyan-300/40 border-t-cyan-200" />
                      Analyzing...
                    </span>
                  ) : (
                    "Ask AI about this node"
                  )}
                </button>

                {aiResponse && (
                  <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-900/60 p-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300/70">
                      AI Analysis
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                      {aiResponse}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
