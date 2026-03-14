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
    <div className="fixed right-6 top-20 z-20 w-64 rounded-2xl border border-cyan-300/20 bg-slate-950/80 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <h4 className="mb-3 text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
        Legend
      </h4>
      <div className="space-y-2">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-slate-300">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
