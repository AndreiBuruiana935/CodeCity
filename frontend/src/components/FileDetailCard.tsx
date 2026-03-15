"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Building, FunctionInfo } from "@/types/city";

/* ── Types ─────────────────────────────────────────────────── */

interface FileDetailCardProps {
  building: Building;
  stats: {
    fanIn: number;
    fanOut: number;
    isOrphan: boolean;
    isHotspot: boolean;
    isEntry: boolean;
    circularWith: string[];
    circularNames: string[];
  };
  allBuildings: Building[];
  githubFileUrl: string | null;
  repoOwner: string | null;
  repoName: string | null;
  repoAvgLoc: number;
  onSelectBuilding: (buildingId: string) => void;
  onClose: () => void;
}

/* ── Risk Gauge SVG ────────────────────────────────────────── */

function RiskGauge({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -220;
  const totalAngle = 260;
  const endAngle = startAngle + (totalAngle * Math.min(score, 100)) / 100;

  const polar = (angle: number) => {
    const rad = (Math.PI / 180) * angle;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const start = polar(startAngle);
  const end = polar(endAngle);
  const bgEnd = polar(startAngle + totalAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const bgLargeArc = totalAngle > 180 ? 1 : 0;

  const color = score > 60 ? "#f87171" : score > 30 ? "#facc15" : "#4ade80";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${bgLargeArc} 1 ${bgEnd.x} ${bgEnd.y}`}
        fill="none" stroke="white" strokeOpacity={0.08} strokeWidth={3.5} strokeLinecap="round"
      />
      {score > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round"
        />
      )}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={16} fontWeight="bold">{Math.round(score)}</text>
    </svg>
  );
}

/* ── Complexity Bar ─────────────────────────────────────────── */

function ComplexityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = value > 12 ? "#f87171" : value > 7 ? "#facc15" : "#4ade80";
  return (
    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/* ── Traffic Light Icon ─────────────────────────────────────── */

function TrafficLight({ value }: { value: number }) {
  const color = value > 12 ? "#f87171" : value > 7 ? "#facc15" : "#4ade80";
  return <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />;
}

/* ── External dep check ─────────────────────────────────────── */

function isExternalDep(dep: string): boolean {
  return !dep.startsWith(".") && !dep.startsWith("@/") && !dep.startsWith("~/") && !dep.startsWith("/");
}

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */

export default function FileDetailCard({
  building: b,
  stats,
  allBuildings,
  githubFileUrl,
  repoOwner,
  repoName,
  repoAvgLoc,
  onSelectBuilding,
  onClose,
}: FileDetailCardProps) {
  const [showAllFunctions, setShowAllFunctions] = useState(false);
  const [showReverseDeps, setShowReverseDeps] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(b.riskScore > 50);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeContent, setCodeContent] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Fetch file content on demand when code section is opened
  useEffect(() => {
    if (!codeOpen || codeContent !== null || codeLoading || !repoOwner || !repoName) return;
    setCodeLoading(true);
    setCodeError(null);
    fetch(`/api/file-content?owner=${encodeURIComponent(repoOwner)}&repo=${encodeURIComponent(repoName)}&path=${encodeURIComponent(b.path)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setCodeError(data.error);
        else setCodeContent(data.content ?? "");
      })
      .catch(() => setCodeError("Failed to fetch file content"))
      .finally(() => setCodeLoading(false));
  }, [codeOpen, codeContent, codeLoading, repoOwner, repoName, b.path]);

  // Reset code state when building changes
  useEffect(() => {
    setCodeContent(null);
    setCodeOpen(false);
    setCodeError(null);
  }, [b.id]);

  // Compute max function complexity in file
  const maxFnComplexity = useMemo(() => {
    return Math.max(...b.functions.map(f => f.complexity), 1);
  }, [b.functions]);

  // Split deps into local vs external
  const localDeps = useMemo(() => b.dependencies.filter(d => !isExternalDep(d)), [b.dependencies]);
  const externalDeps = useMemo(() => b.dependencies.filter(d => isExternalDep(d)), [b.dependencies]);

  // Reverse dependencies (files that import this file)
  const reverseDeps = useMemo(() => {
    return allBuildings.filter(other =>
      other.id !== b.id && other.dependencies.some(d => {
        // Check if dep resolves to this building
        const depLower = d.toLowerCase();
        const pathLower = b.path.toLowerCase();
        const filenameLower = b.filename.toLowerCase();
        return pathLower.includes(depLower.replace(/^[@~]\//, "").replace(/^\.\//, "").replace(/^\.\.\//g, "")) ||
               filenameLower === depLower.split("/").pop() ||
               depLower.endsWith(b.filename.replace(/\.(ts|tsx|js|jsx)$/, ""));
      })
    );
  }, [allBuildings, b]);

  // Primary action
  const primaryAction = useMemo(() => {
    if (b.riskScore > 70) return "Refactor high-complexity paths and isolate dependencies.";
    if (b.riskScore > 40) return "Add tests around critical logic and monitor changes.";
    return "Keep this file stable and document ownership.";
  }, [b.riskScore]);

  // LOC bar (relative to repo average)
  const locBarPct = useMemo(() => {
    if (repoAvgLoc <= 0) return 50;
    return Math.min(100, (b.linesOfCode / (repoAvgLoc * 2)) * 100);
  }, [b.linesOfCode, repoAvgLoc]);

  // Coupling assessment
  const totalConns = stats.fanIn + stats.fanOut;
  const coupling = totalConns > 15 ? "Very High" : totalConns > 8 ? "High" : totalConns > 3 ? "Moderate" : "Low";
  const couplingColor = totalConns > 15 ? "text-red-400" : totalConns > 8 ? "text-orange-400" : totalConns > 3 ? "text-yellow-400" : "text-green-400";

  const displayedFunctions = showAllFunctions ? b.functions : b.functions.slice(0, 10);

  return (
    <div className="flex flex-col">

      {/* ═══ 1. HEADER ZONE ═══════════════════════════════════ */}
      <div className="flex items-start gap-3 border-b border-white/6 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-bold text-white">{b.filename}</h2>
          <p className="truncate text-[13px] text-slate-500 hover:text-slate-300" title={b.path}>
            {b.path}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {b.architecturalRole && (
              <span className="rounded border border-slate-500/30 px-2 py-0.5 text-[13px] font-medium capitalize text-slate-300" style={{ height: 24, lineHeight: "22px" }}>
                {b.architecturalRole}
              </span>
            )}
            {stats.isEntry && (
              <span className="rounded border border-sky-400/40 bg-sky-900/20 px-2 py-0.5 text-[13px] text-sky-200" style={{ height: 24, lineHeight: "22px" }}>
                Entry Point
              </span>
            )}
            {b.securitySensitive && (
              <span className="rounded border border-purple-400/40 bg-purple-900/20 px-2 py-0.5 text-[13px] text-purple-200" style={{ height: 24, lineHeight: "22px" }}>
                Security
              </span>
            )}
          </div>
        </div>

        {/* Risk gauge */}
        <RiskGauge score={b.riskScore} size={56} />

        {/* Close */}
        <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-white">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ═══ ACTION BAR ═════════════════════════════════════ */}
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2">
        {githubFileUrl && (
          <a
            href={githubFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-900/15 px-3 py-1.5 text-[13px] font-medium text-cyan-200 transition hover:border-cyan-300/50 hover:bg-cyan-900/25"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
            See Code
          </a>
        )}
        {repoOwner && repoName && (
          <a
            href={`https://github.com/${repoOwner}/${repoName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-500/30 bg-slate-800/40 px-3 py-1.5 text-[13px] font-medium text-slate-300 transition hover:border-slate-400/50 hover:text-white"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
            See Repo
          </a>
        )}
        {repoOwner && repoName && (
          <button
            type="button"
            onClick={() => setCodeOpen(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition ${
              codeOpen
                ? "border-emerald-400/40 bg-emerald-900/20 text-emerald-200"
                : "border-slate-500/30 bg-slate-800/40 text-slate-300 hover:border-slate-400/50 hover:text-white"
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            {codeOpen ? "Hide Source" : "View Source"}
          </button>
        )}
      </div>

      {/* ═══ INLINE CODE VIEWER ═══════════════════════════════ */}
      {codeOpen && (
        <div className="border-b border-white/6">
          {codeLoading && (
            <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/40 border-t-cyan-200" />
              Loading source...
            </div>
          )}
          {codeError && (
            <div className="px-4 py-3 text-[13px] text-red-400">{codeError}</div>
          )}
          {codeContent !== null && !codeLoading && (
            <div className="relative max-h-80 overflow-auto bg-[#0d1117] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
              <pre className="p-4 text-[13px] leading-relaxed text-slate-300">
                <code>{codeContent}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ═══ 2. METRICS ROW ═══════════════════════════════════ */}
      <div className="grid grid-cols-4 border-b border-white/6" style={{ height: 48 }}>
        {/* LOC */}
        <div className="flex flex-col items-center justify-center border-r border-white/4">
          <div className="flex items-center gap-1.5">
            <span className="text-[18px] font-bold text-white">{b.linesOfCode}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1 w-8 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-400/60" style={{ width: `${locBarPct}%` }} />
            </div>
            <span className="text-[13px] uppercase text-slate-500">LOC</span>
          </div>
        </div>

        {/* Complexity */}
        <div className="flex flex-col items-center justify-center border-r border-white/4">
          <div className="flex items-center gap-1.5">
            <span className="text-[18px] font-bold text-white">{b.complexity}</span>
            <TrafficLight value={b.complexity} />
          </div>
          <span className="text-[13px] uppercase text-slate-500">COMPLEX</span>
        </div>

        {/* Fan-in */}
        <div className="flex flex-col items-center justify-center border-r border-white/4">
          <div className="flex items-center gap-1">
            <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
            <span className="text-[18px] font-bold text-white">{stats.fanIn}</span>
          </div>
          <span className="text-[13px] uppercase text-slate-500">FAN-IN</span>
        </div>

        {/* Fan-out */}
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-center gap-1">
            <svg className="h-3 w-3 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
            </svg>
            <span className="text-[18px] font-bold text-white">{stats.fanOut}</span>
          </div>
          <span className="text-[13px] uppercase text-slate-500">FAN-OUT</span>
        </div>
      </div>

      {/* ═══ 3. AI SUMMARY ════════════════════════════════════ */}
      <div className="border-b border-white/6 px-4 py-3">
        <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-cyan-300">Summary</h3>
        {b.aiSummary ? (
          <p className="text-[15px] leading-relaxed text-slate-300">{b.aiSummary}</p>
        ) : (
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-slate-800" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-800" />
          </div>
        )}
        {/* Primary recommendation */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-950/15 px-3 py-2.5">
          <span className="mt-0.5 text-amber-400">➜</span>
          <span className="text-[14px] leading-snug text-amber-200">{primaryAction}</span>
        </div>
      </div>

      {/* ═══ 4. WARNINGS ══════════════════════════════════════ */}
      {b.aiWarnings.length > 0 && (
        <div className="border-b border-white/6">
          <button
            type="button"
            onClick={() => setWarningsOpen(v => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-white/2"
          >
            <svg className={`h-3 w-3 shrink-0 text-orange-400 transition-transform ${warningsOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-[13px] font-semibold uppercase tracking-wider text-orange-300">
              Warnings ({b.aiWarnings.length})
            </span>
          </button>
          {warningsOpen && (
            <div className="rounded-b-lg bg-[#7c2d12]/10 px-4 pb-3">
              {b.aiWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className="mt-0.5 text-orange-400">⚠</span>
                  <span className="text-[14px] leading-snug text-orange-200/85">{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ 5. FUNCTIONS ═════════════════════════════════════ */}
      {b.functions.length > 0 && (
        <div className="border-b border-white/6 px-4 py-3">
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-cyan-300">
            Functions ({b.functions.length})
          </h3>
          <div className="space-y-1">
            {displayedFunctions.map((fn, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-white/5 bg-white/2 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-medium text-white">{fn.name}</span>
                  <span className="ml-1 text-[13px] text-slate-500">({fn.params.join(", ")})</span>
                </div>
                <ComplexityBar value={fn.complexity} max={maxFnComplexity} />
              </div>
            ))}
          </div>
          {b.functions.length > 10 && !showAllFunctions && (
            <button
              type="button"
              onClick={() => setShowAllFunctions(true)}
              className="mt-1.5 text-[13px] text-cyan-400 transition hover:text-cyan-300"
            >
              Show all {b.functions.length} functions
            </button>
          )}
          {showAllFunctions && b.functions.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllFunctions(false)}
              className="mt-1.5 text-[13px] text-cyan-400 transition hover:text-cyan-300"
            >
              Show fewer
            </button>
          )}
        </div>
      )}

      {/* ═══ 6. DEPENDENCIES ══════════════════════════════════ */}
      {b.dependencies.length > 0 && (
        <div className="border-b border-white/6 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-cyan-300">
              Dependencies ({b.dependencyCount})
            </h3>
            <button
              type="button"
              onClick={() => setShowReverseDeps(v => !v)}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[13px] text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              Imported by {reverseDeps.length} files
            </button>
          </div>

          {/* Reverse deps (expanded) */}
          {showReverseDeps && reverseDeps.length > 0 && (
            <div className="mb-3 rounded-lg border border-white/6 bg-white/2 p-2">
              <div className="mb-1 text-[13px] text-slate-500">Files that import this:</div>
              {reverseDeps.slice(0, 15).map((rd) => (
                <button
                  key={rd.id}
                  type="button"
                  onClick={() => onSelectBuilding(rd.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition hover:bg-white/5"
                >
                  <span className="text-emerald-400">←</span>
                  <span className="min-w-0 truncate text-slate-300">{rd.path}</span>
                </button>
              ))}
              {reverseDeps.length > 15 && (
                <p className="mt-1 text-[13px] text-slate-500">+{reverseDeps.length - 15} more</p>
              )}
            </div>
          )}

          {/* Local deps */}
          {localDeps.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 text-[13px] text-slate-500">Local</div>
              {localDeps.map((dep, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    // Try to find the building for this dep
                    const target = allBuildings.find(other =>
                      other.path.endsWith(dep.replace(/^[@~]\//, "").replace(/^\.\//, "").replace(/^\.\.\//g, "")) ||
                      other.filename === dep.split("/").pop() ||
                      other.path.endsWith(dep.split("/").pop() ?? "")
                    );
                    if (target) onSelectBuilding(target.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition hover:bg-white/5"
                >
                  <span className="text-cyan-400">→</span>
                  <span className="min-w-0 truncate text-slate-300">{dep}</span>
                </button>
              ))}
            </div>
          )}

          {/* External deps */}
          {externalDeps.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] text-slate-500">External</div>
              <div className="flex flex-wrap gap-1">
                {externalDeps.map((dep, i) => (
                  <span key={i} className="rounded border border-white/8 bg-white/3 px-2 py-0.5 text-[13px] text-slate-500">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 7. HEALTH & CONNECTIVITY ════════════════════════ */}
      <div className="px-4 py-3">
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-cyan-300">Health</h3>

        {/* Status badges */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {stats.isHotspot && (
            <span className="rounded-full border border-red-500/40 bg-red-900/20 px-2.5 text-[13px] font-medium text-red-300" style={{ height: 28, lineHeight: "26px" }}>
              Hotspot
            </span>
          )}
          {stats.isEntry && (
            <span className="rounded-full border border-sky-400/40 bg-sky-900/20 px-2.5 text-[13px] font-medium text-sky-300" style={{ height: 28, lineHeight: "26px" }}>
              Entry Point
            </span>
          )}
          {b.securitySensitive && (
            <span className="rounded-full border border-purple-400/40 bg-purple-900/20 px-2.5 text-[13px] font-medium text-purple-300" style={{ height: 28, lineHeight: "26px" }}>
              Security
            </span>
          )}
          {stats.isOrphan && (
            <span className="rounded-full border border-slate-500/40 bg-slate-800/40 px-2.5 text-[13px] font-medium text-slate-400" style={{ height: 28, lineHeight: "26px" }}>
              Orphan
            </span>
          )}
          {stats.circularWith.length > 0 && (
            <span className="rounded-full border border-orange-500/40 bg-orange-900/20 px-2.5 text-[13px] font-medium text-orange-300" style={{ height: 28, lineHeight: "26px" }}>
              Circular
            </span>
          )}
        </div>

        {/* Coupling line */}
        <p className="mb-2 text-[14px] text-slate-400">
          Coupling: <span className={`font-semibold ${couplingColor}`}>{coupling}</span>
          <span className="text-slate-600"> ({totalConns} total connections)</span>
        </p>

        {/* Circular deps box */}
        {stats.circularWith.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-950/10 p-2.5">
            <div className="mb-1 text-[13px] font-semibold text-red-300">Circular Dependencies</div>
            {stats.circularNames.map((name, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const target = allBuildings.find(b => b.filename === name);
                  if (target) onSelectBuilding(target.id);
                }}
                className="flex items-center gap-1.5 py-0.5 text-[13px] text-red-200/80 transition hover:text-red-100"
              >
                <span className="text-red-400">↻</span>
                <span>{name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
