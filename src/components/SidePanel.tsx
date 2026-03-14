"use client";

import { Building } from "@/types/city";

interface SidePanelProps {
  building: Building | null;
  onClose: () => void;
}

export default function SidePanel({ building, onClose }: SidePanelProps) {
  if (!building) return null;

  const riskColor =
    building.riskScore > 60
      ? "text-red-400"
      : building.riskScore > 30
      ? "text-yellow-400"
      : "text-green-400";

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-gray-900/95 border-l border-gray-700 overflow-y-auto z-50 backdrop-blur-sm animate-slide-in">
      {/* Header */}
      <div className="sticky top-0 bg-gray-900/95 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: building.color }}
            />
            <span className="text-xs font-mono text-gray-400">
              {building.colorLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-lg"
          >
            x
          </button>
        </div>
        <h2 className="text-white font-bold text-lg mt-2 font-mono">
          {building.path}
        </h2>
      </div>

      <div className="p-4 space-y-6">
        {/* AI Summary */}
        <section>
          <h3 className="text-indigo-400 font-semibold text-sm uppercase tracking-wide mb-2">
            AI Summary
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            {building.aiSummary || "Analysis pending..."}
          </p>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Lines of Code</div>
            <div className="text-white font-bold text-lg">
              {building.linesOfCode}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Complexity</div>
            <div className="text-white font-bold text-lg">
              {building.complexity}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Dependencies</div>
            <div className="text-white font-bold text-lg">
              {building.dependencyCount}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Functions</div>
            <div className="text-white font-bold text-lg">
              {building.functions.length}
            </div>
          </div>
        </section>

        {/* Functions */}
        {building.functions.length > 0 && (
          <section>
            <h3 className="text-indigo-400 font-semibold text-sm uppercase tracking-wide mb-2">
              Functions
            </h3>
            <div className="space-y-2">
              {building.functions.map((fn, i) => (
                <div
                  key={i}
                  className="bg-gray-800/50 rounded-lg p-3 font-mono text-xs"
                >
                  <div className="text-white">
                    {fn.name}({fn.params.join(", ")})
                  </div>
                  <div className="text-gray-400 mt-1">
                    lines {fn.lines} | complexity: {fn.complexity}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dependencies */}
        {building.dependencies.length > 0 && (
          <section>
            <h3 className="text-indigo-400 font-semibold text-sm uppercase tracking-wide mb-2">
              Dependencies
            </h3>
            <div className="flex flex-wrap gap-2">
              {building.dependencies.map((dep, i) => (
                <span
                  key={i}
                  className="bg-gray-800/50 text-gray-300 text-xs px-2 py-1 rounded-md font-mono"
                >
                  {dep}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Risk Score */}
        <section>
          <h3 className="text-indigo-400 font-semibold text-sm uppercase tracking-wide mb-2">
            Risk Score
          </h3>
          <div className="flex items-center gap-3">
            <div className={`text-4xl font-bold ${riskColor}`}>
              {building.riskScore}
            </div>
            <div className="text-gray-400 text-sm">/ 100</div>
          </div>
          <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${building.riskScore}%`,
                backgroundColor: building.color,
              }}
            />
          </div>
        </section>

        {/* Warnings */}
        {building.aiWarnings.length > 0 && (
          <section>
            <h3 className="text-orange-400 font-semibold text-sm uppercase tracking-wide mb-2">
              Warnings
            </h3>
            <ul className="space-y-2">
              {building.aiWarnings.map((w, i) => (
                <li
                  key={i}
                  className="text-sm text-orange-300/80 flex items-start gap-2"
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
          <section className="bg-indigo-900/30 border border-indigo-700/50 rounded-lg p-3">
            <div className="text-indigo-300 text-sm">
              Reading List Priority: #{building.readingListPriority}
            </div>
          </section>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-2 pb-4">
          {building.entryPoint && (
            <span className="bg-blue-900/50 text-blue-300 text-xs px-2 py-1 rounded-full">
              Entry Point
            </span>
          )}
          {building.securitySensitive && (
            <span className="bg-purple-900/50 text-purple-300 text-xs px-2 py-1 rounded-full">
              Security Sensitive
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
