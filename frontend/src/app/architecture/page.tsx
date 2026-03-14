"use client";

import { useEffect, useState, useCallback } from "react";
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

export default function ArchitecturePage() {
  const { status } = useSession();
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
          context: `The user is exploring the 3D architecture map of "${city?.city.name || "a repository"}". They selected the "${selected.label}" node in the ${selected.layer} layer which has ${selected.connectionCount} connections. Explain its role.`,
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
          Building your architecture map...
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
    <div className="flex h-screen w-screen flex-col bg-[#070d17] text-slate-100">
      {/* Top bar */}
      <div className="z-20 shrink-0 border-b border-cyan-300/15 bg-slate-950/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-4">
            <h1 className="bg-linear-to-r from-cyan-200 via-blue-200 to-emerald-200 bg-clip-text text-lg font-bold text-transparent">
              Architecture Map
            </h1>
            <span className="font-mono text-sm text-slate-300">
              {city.city.name}
            </span>
            <span className="text-xs text-slate-500">
              {city.city.language} / {city.city.framework} / {city.city.architecture}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetCity();
                router.push("/");
              }}
              className="rounded-lg border border-slate-600/50 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            >
              New
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

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* 3D map */}
        <div className="relative min-w-0 flex-1 overflow-auto px-5 py-4">
          <ArchitectureMap onSelect={handleSelect} city={city} />
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
