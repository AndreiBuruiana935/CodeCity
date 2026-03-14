"use client";

import { Building, DistrictDetails } from "@/types/city";

interface SidePanelProps {
  building: Building | null;
  districtDetails?: DistrictDetails | null;
  summaryLoading?: boolean;
  onViewCode?: (building: Building) => void;
  onClose: () => void;
}

export default function SidePanel({
  building,
  districtDetails,
  summaryLoading,
  onViewCode,
  onClose,
}: SidePanelProps) {
  if (!building && !districtDetails) return null;

  if (!building && districtDetails) {
    return (
      <div className="h-full w-full overflow-y-auto bg-slate-950/95">
        <div className="sticky top-0 z-10 border-b border-slate-700/60 bg-slate-950/95 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-cyan-300" />
              <span className="text-xs font-semibold tracking-[0.12em] text-cyan-200 uppercase">
                District
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-lg text-slate-400 transition-colors hover:text-white"
            >
              x
            </button>
          </div>
          <h2 className="mt-2 wrap-break-word font-mono text-sm text-slate-200">
            {districtDetails.name}
          </h2>
          <p className="mt-1 text-xs text-slate-400">Neighborhood: {districtDetails.neighborhood}</p>
        </div>

        <div className="space-y-5 p-5">
          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
              District Overview
            </h3>
            <p className="text-sm leading-relaxed text-slate-300">{districtDetails.description}</p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
              <div className="text-xs text-slate-400">Buildings</div>
              <div className="text-lg font-bold text-white">{districtDetails.buildingCount}</div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
              <div className="text-xs text-slate-400">Subdistricts</div>
              <div className="text-lg font-bold text-white">{districtDetails.subdistrictCount}</div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
              <div className="text-xs text-slate-400">Total LOC</div>
              <div className="text-lg font-bold text-white">{districtDetails.totalLinesOfCode}</div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
              <div className="text-xs text-slate-400">Average Risk</div>
              <div className="text-lg font-bold text-white">{districtDetails.averageRisk}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
              Top Risk In District
            </h3>
            <div className="mb-3 text-3xl font-bold text-amber-300">{districtDetails.maxRisk} / 100</div>
            <div className="space-y-2">
              {districtDetails.topFiles.map((file) => (
                <div key={file} className="rounded-lg border border-slate-700/50 bg-slate-900/70 p-2 font-mono text-xs text-slate-300">
                  {file}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!building) return null;

  const maintainability =
    building.complexity > 12
      ? "Low"
      : building.complexity > 7
      ? "Medium"
      : "High";

  const volatility =
    building.dependencyCount > 10
      ? "High"
      : building.dependencyCount > 4
      ? "Medium"
      : "Low";

  const primaryAction =
    building.riskScore > 70
      ? "Refactor high-complexity paths and isolate dependencies."
      : building.riskScore > 40
      ? "Add tests around critical logic and monitor changes."
      : "Keep this file stable and document ownership.";

  const riskColor =
    building.riskScore > 60
      ? "text-red-400"
      : building.riskScore > 30
      ? "text-yellow-400"
      : "text-green-400";

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-950/95">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-700/60 bg-slate-950/95 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: building.color }}
            />
            <span className="text-xs font-semibold tracking-[0.12em] text-cyan-200 uppercase">
              {building.colorLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-lg text-slate-400 transition-colors hover:text-white"
          >
            x
          </button>
        </div>
        <h2 className="mt-2 wrap-break-word font-mono text-sm text-slate-200">
          {building.path}
        </h2>
      </div>

      <div className="space-y-5 p-5">
        {/* AI Summary */}
        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
            Summary
          </h3>
          <p className="text-sm leading-relaxed text-slate-300">
            {summaryLoading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                Generating summary…
              </span>
            ) : (
              building.aiSummary || "No summary available."
            )}
          </p>

          <div className="mt-4">
            <button
              onClick={() => onViewCode?.(building)}
              className="rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-400/15"
            >
              View Code
            </button>
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
            <div className="text-xs text-slate-400">Lines of Code</div>
            <div className="text-lg font-bold text-white">
              {building.linesOfCode}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
            <div className="text-xs text-slate-400">Complexity</div>
            <div className="text-lg font-bold text-white">
              {building.complexity}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
            <div className="text-xs text-slate-400">Dependencies</div>
            <div className="text-lg font-bold text-white">
              {building.dependencyCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
            <div className="text-xs text-slate-400">Functions</div>
            <div className="text-lg font-bold text-white">
              {building.functions.length}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
            <div className="text-xs text-slate-400">Maintainability</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{maintainability}</div>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/55 p-3">
            <div className="text-xs text-slate-400">Dependency Volatility</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">{volatility}</div>
          </div>
        </section>

        {/* Functions */}
        {building.functions.length > 0 && (
          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
              Functions Overview
            </h3>
            <div className="space-y-2">
              {building.functions.slice(0, 12).map((fn, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-700/50 bg-slate-900/70 p-3 font-mono text-xs"
                >
                  <div className="text-slate-100">
                    {fn.name}({fn.params.join(", ")})
                  </div>
                  <div className="mt-1 text-slate-400">
                    lines {fn.lines} | complexity: {fn.complexity}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dependencies */}
        {building.dependencies.length > 0 && (
          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
              Dependencies
            </h3>
            <div className="flex flex-wrap gap-2">
              {building.dependencies.map((dep, i) => (
                <span
                  key={i}
                  className="rounded-md border border-slate-700/60 bg-slate-900/70 px-2 py-1 font-mono text-xs text-slate-300"
                >
                  {dep}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Risk Score */}
        <section className="rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
            Risk Score
          </h3>
          <div className="flex items-center gap-3">
            <div className={`text-4xl font-bold ${riskColor}`}>
              {building.riskScore}
            </div>
            <div className="text-sm text-slate-400">/ 100</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${building.riskScore}%`,
                backgroundColor: building.color,
              }}
            />
          </div>
          <p className="mt-3 text-sm text-slate-300">{primaryAction}</p>
        </section>

        {/* Warnings */}
        {building.aiWarnings.length > 0 && (
          <section className="rounded-2xl border border-orange-400/25 bg-orange-950/20 p-4">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-orange-300 uppercase">
              Warnings
            </h3>
            <ul className="space-y-2">
              {building.aiWarnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-orange-200/85"
                >
                  <span className="text-orange-400 mt-0.5">!</span>
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Reading list priority */}
        {building.readingListPriority < 999 && (
          <section className="rounded-xl border border-cyan-400/30 bg-cyan-900/20 p-3">
            <div className="text-sm text-cyan-200">
              Reading List Priority: #{building.readingListPriority}
            </div>
          </section>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-2 pb-4">
          {building.entryPoint && (
            <span className="rounded-full border border-blue-400/40 bg-blue-900/30 px-2 py-1 text-xs text-blue-200">
              Entry Point
            </span>
          )}
          {building.securitySensitive && (
            <span className="rounded-full border border-purple-400/40 bg-purple-900/30 px-2 py-1 text-xs text-purple-200">
              Security Sensitive
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
