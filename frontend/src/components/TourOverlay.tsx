"use client";

import { TourStop } from "@/types/city";

interface TourOverlayProps {
  stops: TourStop[];
  currentStop: number;
  onNext: () => void;
  onPrev: () => void;
  onEnd: () => void;
}

export default function TourOverlay({
  stops,
  currentStop,
  onNext,
  onPrev,
  onEnd,
}: TourOverlayProps) {
  const stop = stops[currentStop];
  if (!stop) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 w-125">
      <div className="bg-gray-900/95 border border-indigo-600/50 rounded-xl p-5 backdrop-blur-sm shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="bg-indigo-600 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center">
              {stop.stop}
            </span>
            <h3 className="text-white font-bold">{stop.label}</h3>
          </div>
          <span className="text-gray-400 text-xs">
            {currentStop + 1} / {stops.length}
          </span>
        </div>
        <div className="text-indigo-300 text-xs font-mono mb-2">
          {stop.file}
        </div>
        <p className="text-gray-300 text-sm">{stop.description}</p>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={onPrev}
            disabled={currentStop === 0}
            className="text-gray-400 hover:text-white disabled:opacity-30 text-sm transition"
          >
            Previous
          </button>
          <div className="flex gap-1">
            {stops.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition ${
                  i === currentStop ? "bg-indigo-400" : "bg-gray-600"
                }`}
              />
            ))}
          </div>
          {currentStop < stops.length - 1 ? (
            <button
              onClick={onNext}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-sm transition"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onEnd}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm transition"
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
