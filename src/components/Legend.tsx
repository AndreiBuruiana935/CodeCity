"use client";

const LEGEND_ITEMS = [
  { color: "#FF3B30", label: "High Complexity (>10)" },
  { color: "#FFD60A", label: "High Dependencies (>5)" },
  { color: "#0A84FF", label: "Entry Point" },
  { color: "#BF5AF2", label: "Security Sensitive" },
  { color: "#30D158", label: "Low Risk" },
  { color: "#FF9F0A", label: "Deprecated / TODOs" },
  { color: "#8E8E93", label: "Binary / Unavailable" },
];

export default function Legend() {
  return (
    <div className="fixed bottom-6 right-6 z-20 bg-gray-900/90 border border-gray-700 rounded-xl p-4 backdrop-blur-sm">
      <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">
        Legend
      </h4>
      <div className="space-y-2">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-gray-300 text-xs">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
