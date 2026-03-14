"use client";

import { useState, useMemo } from "react";
import { CitySchema, Building } from "@/types/city";

interface FileTreeProps {
  city: CitySchema;
  selectedBuildingId: string | null;
  highlightedBuildings: string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onBuildingClick: (building: Building) => void;
  onDistrictClick: (districtId: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  building?: Building;
  districtId?: string;
  fileCount: number;
  maxRisk: number;
}

function buildTree(city: CitySchema): TreeNode {
  const root: TreeNode = {
    name: city.city.name || "root",
    path: "",
    children: [],
    fileCount: 0,
    maxRisk: 0,
  };

  for (const district of city.city.districts) {
    const parts = district.name === "." ? [] : district.name.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let child = current.children.find(
        (c) => c.name === part && !c.building
      );
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: [],
          fileCount: 0,
          maxRisk: 0,
        };
        current.children.push(child);
      }
      current = child;
    }

    current.districtId = district.id;

    for (const building of district.buildings) {
      current.children.push({
        name: building.filename,
        path: building.path,
        children: [],
        building,
        fileCount: 1,
        maxRisk: building.riskScore,
      });
    }
  }

  function computeCounts(node: TreeNode): void {
    if (node.building) return;
    let count = 0;
    let risk = 0;
    for (const child of node.children) {
      computeCounts(child);
      count += child.fileCount;
      risk = Math.max(risk, child.maxRisk);
    }
    node.fileCount = count;
    node.maxRisk = risk;
  }

  computeCounts(root);

  // Sort: folders first (alphabetical), then files (alphabetical)
  function sortChildren(node: TreeNode): void {
    node.children.sort((a, b) => {
      const aIsFile = !!a.building;
      const bIsFile = !!b.building;
      if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (!child.building) sortChildren(child);
    }
  }

  sortChildren(root);
  return root;
}

function riskDotColor(riskScore: number): string {
  if (riskScore > 60) return "#FF3B30";
  if (riskScore > 30) return "#FFD60A";
  return "#30D158";
}

function TreeNodeRow({
  node,
  depth,
  selectedBuildingId,
  highlightedBuildings,
  searchQuery,
  onBuildingClick,
  onDistrictClick,
}: {
  node: TreeNode;
  depth: number;
  selectedBuildingId: string | null;
  highlightedBuildings: string[];
  searchQuery: string;
  onBuildingClick: (building: Building) => void;
  onDistrictClick: (districtId: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isFile = !!node.building;
  const isSelected = isFile && node.building!.id === selectedBuildingId;
  const isHighlighted =
    isFile && highlightedBuildings.includes(node.building!.id);
  const matchesSearch =
    searchQuery &&
    node.name.toLowerCase().includes(searchQuery.toLowerCase());

  if (isFile) {
    const b = node.building!;
    return (
      <button
        onClick={() => onBuildingClick(b)}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition ${
          isSelected
            ? "bg-cyan-900/40 text-white"
            : isHighlighted
            ? "bg-amber-900/30 text-amber-100"
            : matchesSearch
            ? "bg-blue-900/25 text-blue-100"
            : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: b.color || riskDotColor(b.riskScore) }}
        />
        <span className="truncate font-mono">{node.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-slate-500">
          {b.linesOfCode}
        </span>
      </button>
    );
  }

  // Folder
  return (
    <div>
      <button
        onClick={() => {
          setExpanded(!expanded);
          if (node.districtId) onDistrictClick(node.districtId);
        }}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition ${
          matchesSearch
            ? "bg-blue-900/20 text-blue-100"
            : "text-slate-200 hover:bg-slate-800/60"
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <span className="shrink-0 text-[10px] text-slate-500">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="truncate font-semibold">{node.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: riskDotColor(node.maxRisk) }}
          />
          <span className="text-[10px] text-slate-500">{node.fileCount}</span>
        </span>
      </button>
      {expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path || child.name}
              node={child}
              depth={depth + 1}
              selectedBuildingId={selectedBuildingId}
              highlightedBuildings={highlightedBuildings}
              searchQuery={searchQuery}
              onBuildingClick={onBuildingClick}
              onDistrictClick={onDistrictClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({
  city,
  selectedBuildingId,
  highlightedBuildings,
  searchQuery,
  onSearchChange,
  onBuildingClick,
  onDistrictClick,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(city), [city]);

  const totalFiles = useMemo(
    () => city.city.districts.reduce((s, d) => s + d.buildings.length, 0),
    [city]
  );

  return (
    <div className="flex h-full flex-col border-r border-cyan-300/15 bg-slate-950/90">
      {/* Search */}
      <div className="border-b border-slate-700/50 p-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search files..."
          className="w-full rounded-lg border border-slate-600/50 bg-slate-900/70 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30"
        />
        <div className="mt-1.5 text-[10px] text-slate-500">
          {totalFiles} files · {city.city.districts.length} folders
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1 py-2">
        {tree.children.map((child) => (
          <TreeNodeRow
            key={child.path || child.name}
            node={child}
            depth={0}
            selectedBuildingId={selectedBuildingId}
            highlightedBuildings={highlightedBuildings}
            searchQuery={searchQuery}
            onBuildingClick={onBuildingClick}
            onDistrictClick={onDistrictClick}
          />
        ))}
      </div>
    </div>
  );
}
