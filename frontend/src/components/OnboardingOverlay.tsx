"use client";

import { OnboardingSummary } from "@/types/city";
import { useState } from "react";

interface OnboardingOverlayProps {
  onboarding: OnboardingSummary;
  onClose: () => void;
  onTourStart: () => void;
  onBuildingFocus: (buildingId: string) => void;
}

export default function OnboardingOverlay({
  onboarding,
  onClose,
  onTourStart,
  onBuildingFocus,
}: OnboardingOverlayProps) {
  const [tab, setTab] = useState<"summary" | "tour" | "reading" | "risk">(
    "summary"
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-175 max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-white text-xl font-bold">
            Welcome to CodeAtlas
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            x
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {(
            [
              { key: "summary", label: "Overview" },
              { key: "tour", label: "Guided Tour" },
              { key: "reading", label: "Reading List" },
              { key: "risk", label: "Risk Report" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-medium transition ${
                tab === key
                  ? "text-indigo-400 border-b-2 border-indigo-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {tab === "summary" && (
            <div className="space-y-4">
              <p className="text-gray-300 leading-relaxed text-sm">
                {onboarding.plainEnglish}
              </p>
              <button
                onClick={() => {
                  onTourStart();
                  onClose();
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition mt-4"
              >
                Start Guided Tour
              </button>
            </div>
          )}

          {tab === "tour" && (
            <div className="space-y-4">
              {onboarding.guidedTour.map((stop) => (
                <button
                  key={stop.stop}
                  onClick={() => {
                    onBuildingFocus(stop.buildingId);
                    onClose();
                  }}
                  className="w-full text-left bg-gray-800/50 hover:bg-gray-800 rounded-lg p-4 transition"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="bg-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                      {stop.stop}
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {stop.label}
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs font-mono ml-9">
                    {stop.file}
                  </div>
                  <div className="text-gray-300 text-sm ml-9 mt-1">
                    {stop.description}
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "reading" && (
            <div className="space-y-3">
              {onboarding.readingList.map((item) => (
                <button
                  key={item.priority}
                  onClick={() => {
                    onBuildingFocus(item.buildingId);
                    onClose();
                  }}
                  className="w-full text-left bg-gray-800/50 hover:bg-gray-800 rounded-lg p-3 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-indigo-400 font-bold text-sm">
                        #{item.priority}
                      </span>
                      <span className="text-white text-sm ml-2 font-mono">
                        {item.file}
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      ~{item.estimatedMinutes} min
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {item.reason}
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "risk" && (
            <div className="space-y-3">
              {onboarding.riskReport.map((item) => (
                <button
                  key={item.rank}
                  onClick={() => {
                    onBuildingFocus(item.buildingId);
                    onClose();
                  }}
                  className="w-full text-left bg-gray-800/50 hover:bg-gray-800 rounded-lg p-3 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 font-bold text-sm">
                        #{item.rank}
                      </span>
                      <span className="text-white text-sm font-mono">
                        {item.file}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        item.riskScore > 60
                          ? "text-red-400"
                          : item.riskScore > 30
                          ? "text-yellow-400"
                          : "text-green-400"
                      }`}
                    >
                      {item.riskScore}/100
                    </span>
                  </div>
                  {item.warnings.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {item.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="text-orange-300/70 text-xs"
                        >
                          ! {w}
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
