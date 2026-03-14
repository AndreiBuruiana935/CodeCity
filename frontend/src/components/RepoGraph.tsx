"use client";

import {
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useState,
} from "react";
import { CitySchema, Building } from "@/types/city";
import dynamic from "next/dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as any;

interface RepoGraphProps {
  city: CitySchema;
  selectedBuildingId: string | null;
  highlightedBuildings: string[];
  cameraTarget: string | null;
  onBuildingClick: (building: Building) => void;
  onDistrictClick: (districtId: string) => void;
}

interface GraphNode {
  id: string;
  name: string;
  path: string;
  val: number;
  color: string;
  group: string;
  groupName: string;
  riskScore: number;
  complexity: number;
  dependencyCount: number;
  linesOfCode: number;
  entryPoint: boolean;
  securitySensitive: boolean;
  building: Building;
  // injected by d3-force at runtime
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

function nodeRadius(linesOfCode: number): number {
  return Math.max(3, Math.min(22, Math.sqrt(linesOfCode) * 0.6));
}

export default function RepoGraph({
  city,
  selectedBuildingId,
  highlightedBuildings,
  cameraTarget,
  onBuildingClick,
  onDistrictClick,
}: RepoGraphProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Build graph data from city
  const graphData = useMemo(() => {
    const buildingMap = new Map<string, Building>();
    const nodes: GraphNode[] = [];
    const nodeIds = new Set<string>();

    for (const district of city.city.districts) {
      for (const b of district.buildings) {
        buildingMap.set(b.id, b);
        nodeIds.add(b.id);
        nodes.push({
          id: b.id,
          name: b.filename,
          path: b.path,
          val: Math.sqrt(b.linesOfCode) * 0.5,
          color: b.color,
          group: district.id,
          groupName: district.name,
          riskScore: b.riskScore,
          complexity: b.complexity,
          dependencyCount: b.dependencyCount,
          linesOfCode: b.linesOfCode,
          entryPoint: b.entryPoint,
          securitySensitive: b.securitySensitive,
          building: b,
        });
      }
    }

    const links: GraphLink[] = city.city.roads
      .filter((r) => nodeIds.has(r.from) && nodeIds.has(r.to))
      .map((r) => ({
        source: r.from,
        target: r.to,
        weight: r.weight,
      }));

    return { nodes, links };
  }, [city]);

  // Connected nodes lookup for highlighting
  const connectedMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of graphData.links) {
      const s = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
      const t = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [graphData]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fly to camera target
  useEffect(() => {
    if (!cameraTarget || !fgRef.current) return;
    const node = graphData.nodes.find((n) => n.id === cameraTarget);
    if (node && node.x != null && node.y != null) {
      fgRef.current.centerAt(node.x, node.y, 600);
      fgRef.current.zoom(3, 600);
    }
  }, [cameraTarget, graphData.nodes]);

  // Configure forces after mount
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;

    // Increase charge repulsion for better spacing
    const charge = fg.d3Force("charge");
    if (charge && typeof charge.strength === "function") {
      charge.strength(-120);
    }

    // Cluster force: nudge nodes toward their district centroid
    const link = fg.d3Force("link");
    if (link && typeof link.distance === "function") {
      link.distance((l: GraphLink) => 30 + 20 / (l.weight || 1));
    }
  }, [graphData]);

  const activeNodeId = selectedBuildingId || hoveredNode;
  const activeConnections = activeNodeId ? connectedMap.get(activeNodeId) : null;

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.building) {
        onBuildingClick(node.building);
      }
    },
    [onBuildingClick]
  );

  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      setHoveredNode(node?.id ?? null);
    },
    []
  );

  const handleBackgroundClick = useCallback(() => {
    // Do nothing — let parent handle deselection via other means
  }, []);

  // Custom node rendering
  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node.linesOfCode ?? 50);
      const isActive = node.id === activeNodeId;
      const isConnected = activeConnections?.has(node.id);
      const isHighlighted = highlightedBuildings.includes(node.id);
      const isSelected = node.id === selectedBuildingId;

      // Glow for highlighted/selected
      if (isHighlighted || isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected
          ? "rgba(34, 211, 238, 0.25)"
          : "rgba(251, 191, 36, 0.25)";
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      const alpha =
        !activeNodeId || isActive || isConnected || isHighlighted
          ? 1
          : 0.15;
      ctx.fillStyle = node.color || "#8E8E93";
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Ring for entry point / security-sensitive
      if (node.entryPoint || node.securitySensitive) {
        ctx.beginPath();
        ctx.arc(x, y, r + 1.5, 0, 2 * Math.PI);
        ctx.strokeStyle = node.entryPoint ? "#0A84FF" : "#BF5AF2";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label (only when zoomed in enough)
      if (globalScale > 1.2 || isActive || isHighlighted) {
        const fontSize = Math.max(3, 10 / globalScale);
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle =
          isActive || isHighlighted
            ? "rgba(255,255,255,0.95)"
            : "rgba(203,213,225,0.75)";
        const label =
          node.name && node.name.length > 20
            ? node.name.slice(0, 18) + "…"
            : node.name || "";
        ctx.fillText(label, x, y + r + 2);
      }
    },
    [activeNodeId, activeConnections, highlightedBuildings, selectedBuildingId]
  );

  // Custom node pointer area
  const paintNodeArea = useCallback(
    (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const r = nodeRadius(node.linesOfCode ?? 50);
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r + 2, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  // Link color based on active state
  const linkColor = useCallback(
    (link: GraphLink) => {
      if (!activeNodeId) return "rgba(100, 116, 139, 0.08)";
      const s = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
      const t = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
      if (s === activeNodeId || t === activeNodeId) {
        return "rgba(34, 211, 238, 0.6)";
      }
      return "rgba(100, 116, 139, 0.04)";
    },
    [activeNodeId]
  );

  const linkWidth = useCallback(
    (link: GraphLink) => {
      if (!activeNodeId) return 0.3;
      const s = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
      const t = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
      if (s === activeNodeId || t === activeNodeId) {
        return Math.max(1, Math.min(3, link.weight));
      }
      return 0.2;
    },
    [activeNodeId]
  );

  const linkDirectionalArrow = useCallback(
    (link: GraphLink) => {
      if (!activeNodeId) return 0;
      const s = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
      const t = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
      if (s === activeNodeId || t === activeNodeId) return 4;
      return 0;
    },
    [activeNodeId]
  );

  // Node tooltip
  const nodeLabel = useCallback(
    (node: GraphNode) => {
      return `<div style="background:#0f172a;border:1px solid rgba(34,211,238,0.3);border-radius:8px;padding:8px 12px;font-size:12px;color:#e2e8f0;max-width:260px;">
        <div style="font-weight:600;color:#fff;margin-bottom:4px;word-break:break-all;">${node.path || node.name}</div>
        <div style="color:#94a3b8;font-size:11px;">
          LOC: ${node.linesOfCode} · Risk: ${node.riskScore} · Complexity: ${node.complexity} · Deps: ${node.dependencyCount}
        </div>
      </div>`;
    },
    []
  );

  // Draw district cluster backgrounds
  const paintBackground = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      // Group nodes by district
      const groups = new Map<string, { nodes: GraphNode[]; name: string }>();
      for (const node of graphData.nodes) {
        if (node.x == null || node.y == null) continue;
        if (!groups.has(node.group)) {
          groups.set(node.group, { nodes: [], name: node.groupName });
        }
        groups.get(node.group)!.nodes.push(node);
      }

      for (const [, group] of groups) {
        if (group.nodes.length < 2) continue;

        // Compute bounding box
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        for (const n of group.nodes) {
          const r = nodeRadius(n.linesOfCode);
          minX = Math.min(minX, (n.x ?? 0) - r);
          maxX = Math.max(maxX, (n.x ?? 0) + r);
          minY = Math.min(minY, (n.y ?? 0) - r);
          maxY = Math.max(maxY, (n.y ?? 0) + r);
        }

        const pad = 15;
        const rx = 8;

        ctx.beginPath();
        ctx.roundRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, rx);
        ctx.fillStyle = "rgba(30, 41, 59, 0.25)";
        ctx.fill();
        ctx.strokeStyle = "rgba(100, 116, 139, 0.15)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // District label
        if (globalScale > 0.4) {
          const fontSize = Math.max(4, 10 / globalScale);
          ctx.font = `600 ${fontSize}px sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
          const label = group.name.length > 30 ? group.name.slice(0, 28) + "…" : group.name;
          ctx.fillText(label, minX - pad + 4, minY - pad + 2);
        }
      }
    },
    [graphData.nodes]
  );

  return (
    <div ref={containerRef} className="relative h-full w-full bg-[#080e1a]">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#080e1a"
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintNodeArea}
        nodeLabel={nodeLabel}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalArrowLength={linkDirectionalArrow}
        linkDirectionalArrowRelPos={0.85}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        onRenderFramePre={paintBackground}
        enableNodeDrag={true}
        cooldownTicks={120}
        warmupTicks={30}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        minZoom={0.3}
        maxZoom={12}
      />

      {/* Legend overlay */}
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-xl border border-cyan-300/15 bg-slate-950/80 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#30D158]" />
            Low risk
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#FFD60A]" />
            Medium
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#FF3B30]" />
            High risk
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full border border-[#0A84FF]" />
            Entry
          </span>
        </div>
      </div>
    </div>
  );
}
