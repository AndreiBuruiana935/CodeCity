"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CitySchema } from "@/types/city";

/* ------------------------------------------------------------------ */
/*  DATA — nodes and connections derived from codebase analysis        */
/* ------------------------------------------------------------------ */

interface NodeDef {
  id: string;
  lb: string;
  l: "db" | "be" | "api" | "fe";
  x: number;
  z: number;
  loc?: number;
  risk?: number;
  hotspot?: boolean;
  entryPoint?: boolean;
  security?: boolean;
  fanIn?: number;
  fanOut?: number;
  orphan?: boolean;
  circular?: boolean;
  colorLabel?: string;
  aiSummary?: string;
  testCoverage?: "covered" | "uncovered" | "unknown";
}

type ConnType = "import" | "cross-layer" | "circular" | "type-import";

interface Conn {
  a: string;
  b: string;
  type: ConnType;
  weight: number;
}

export interface ArchSelection {
  id: string;
  label: string;
  layer: string;
  connectionCount: number;
  connectedTo: string[];
}

const STATIC_ND: NodeDef[] = [
  // -- Database layer --
  { id: "ctyp", lb: "Data Types",       l: "db",  x: -5,    z: -1.5 },
  { id: "nxtd", lb: "NextAuth Types",   l: "db",  x: -1.5,  z: -3   },
  { id: "lcst", lb: "LocalStorage",     l: "db",  x: 2.5,   z: 0    },
  { id: "bcch", lb: "LLM Cache",        l: "db",  x: 6,     z: -1.5 },

  // -- Backend / service layer --
  { id: "cart", lb: "Cartographer",      l: "be",  x: -6,    z: 2    },
  { id: "insp", lb: "Inspector",         l: "be",  x: -3,    z: -2   },
  { id: "guid", lb: "Guide Agent",       l: "be",  x: 0,     z: 2.5  },
  { id: "anlz", lb: "Static Analyzer",   l: "be",  x: 3,     z: -1   },
  { id: "ctgn", lb: "Graph Generator",   l: "be",  x: -1,    z: -0.5 },
  { id: "ghub", lb: "GitHub Client",     l: "be",  x: 5.5,   z: 1    },
  { id: "aism", lb: "AI Summarizer",     l: "be",  x: 6.5,   z: -2.5 },
  { id: "auth", lb: "Auth Config",       l: "be",  x: -5.5,  z: -3   },

  // -- API layer --
  { id: "aAnl", lb: "POST /api/analyze",        l: "api", x: -5,    z: 0    },
  { id: "aQst", lb: "POST /api/question",       l: "api", x: -2.5,  z: 2.5  },
  { id: "aSum", lb: "POST /api/summarize",       l: "api", x: 0.5,   z: -2   },
  { id: "aNxt", lb: "NextAuth Route",            l: "api", x: -6.5,  z: -2.5 },
  { id: "aCfg", lb: "GET /auth/config",          l: "api", x: -4,    z: -3.5 },
  { id: "aRep", lb: "GET /api/github/repos",     l: "api", x: 3,     z: 1.5  },
  { id: "aDet", lb: "GET /api/repo-details",     l: "api", x: 5.5,   z: -0.5 },
  { id: "bMap", lb: "POST /map-repository",      l: "api", x: -7,    z: 1.5  },
  { id: "bIns", lb: "POST /inspect-file",        l: "api", x: 2,     z: 3.5  },
  { id: "bGud", lb: "POST /chat-guide",          l: "api", x: 7,     z: 2    },
  { id: "bClr", lb: "POST /clear-cache",         l: "api", x: 6,     z: 3.5  },
  { id: "bHlt", lb: "GET / (health)",            l: "api", x: 7.5,   z: -2   },

  // -- Frontend layer --
  { id: "pLnd", lb: "Landing Page",       l: "fe", x: -5.5,  z: -1   },
  { id: "pPrj", lb: "Projects Page",      l: "fe", x: -2,    z: 2    },
  { id: "pCty", lb: "Architecture Page",  l: "fe", x: 2,     z: 0    },
  { id: "cLay", lb: "Root Layout",        l: "fe", x: -7.5,  z: 0.5  },
  { id: "cCtx", lb: "AppContext",          l: "fe", x: -3.5,  z: -3   },
  { id: "cAPr", lb: "AuthProvider",        l: "fe", x: -7,    z: -2   },
  { id: "cSid", lb: "SidePanel",           l: "fe", x: 5,     z: -2   },
  { id: "cFTr", lb: "FileTree",            l: "fe", x: 5,     z: 1    },
  { id: "cGrp", lb: "RepoGraph",           l: "fe", x: 6.5,   z: -0.5 },
  { id: "cQBr", lb: "QuestionBar",         l: "fe", x: 7.5,   z: 2    },
  { id: "cOnb", lb: "OnboardingOverlay",   l: "fe", x: 3.5,   z: 3    },
  { id: "cTor", lb: "TourOverlay",         l: "fe", x: 1,     z: 3.5  },
];

const STATIC_CO_RAW: [string, string][] = [
  ["pLnd", "aCfg"], ["cCtx", "aAnl"], ["cCtx", "aSum"], ["pPrj", "aRep"],
  ["pPrj", "aDet"], ["cQBr", "bGud"], ["aAnl", "ghub"], ["aAnl", "ctgn"],
  ["aAnl", "aism"], ["aQst", "aism"], ["aNxt", "auth"], ["bMap", "cart"],
  ["bIns", "insp"], ["bGud", "guid"], ["bClr", "bcch"], ["ctgn", "anlz"],
  ["ctgn", "ghub"], ["aism", "ctyp"], ["anlz", "ctyp"], ["ctgn", "ctyp"],
  ["aQst", "ctyp"], ["cCtx", "ctyp"], ["cCtx", "lcst"], ["pLnd", "lcst"],
  ["cart", "bcch"], ["insp", "bcch"], ["cLay", "cAPr"], ["cLay", "cCtx"],
  ["pCty", "cFTr"], ["pCty", "cGrp"], ["pCty", "cSid"], ["pCty", "cQBr"],
  ["pCty", "cOnb"], ["pCty", "cTor"], ["pLnd", "cCtx"], ["pPrj", "cCtx"],
  ["pCty", "cCtx"], ["cSid", "ctyp"], ["cFTr", "ctyp"], ["cGrp", "ctyp"],
  ["cQBr", "ctyp"], ["cOnb", "ctyp"], ["cTor", "ctyp"],
];

const STATIC_CO: Conn[] = STATIC_CO_RAW.map(([a, b]) => ({ a, b, type: "import", weight: 1 }));

/* ------------------------------------------------------------------ */
/*  DYNAMIC REPO -> ARCHITECTURE DATA                                  */
/* ------------------------------------------------------------------ */

const AI_LAYER_TO_SHORT: Record<string, "db" | "be" | "api" | "fe"> = {
  database: "db",
  backend: "be",
  api: "api",
  frontend: "fe",
};

/**
 * Classify a file into an architecture layer.
 * Priority: AI-assigned layer > AI role heuristic > regex fallback.
 */
export function classifyLayer(
  path: string,
  role?: string,
  aiLayer?: string,
): "db" | "be" | "api" | "fe" {
  if (aiLayer && AI_LAYER_TO_SHORT[aiLayer]) {
    return AI_LAYER_TO_SHORT[aiLayer];
  }
  if (role) {
    switch (role) {
      case "model": case "migration": return "db";
      case "route": case "controller": case "middleware": return "api";
      case "service": case "utility": case "config": case "type": return "be";
      case "component": case "hook": case "entry": return "fe";
    }
  }
  const p = path.toLowerCase();
  if (/\/(api|routes|controllers|endpoints)\//.test(p) || /\/server\.(ts|js|mjs)$/.test(p))
    return "api";
  if (/\.d\.ts$/.test(p) || /\/src\/types?\//.test(p))
    return "be";
  if (
    /\/(models?|schema|database|db|prisma|migrations?|entities|seeds?)\//.test(p) ||
    /\.(sql|prisma)$/.test(p)
  )
    return "db";
  if (
    /\/(lib|services?|utils?|helpers?|middleware|config|scripts?)\//.test(p) ||
    /\.(config|rc)\.(ts|js|mjs|cjs|json)$/.test(p)
  )
    return "be";
  return "fe";
}

/* ------------------------------------------------------------------ */
/*  GRID LAYOUT                                                        */
/* ------------------------------------------------------------------ */

/**
 * Even grid layout: places nodes in a uniform grid with equal spacing.
 * Nodes are sorted so that connected ones end up near each other,
 * but the grid itself is perfectly even — no clustering.
 */
function runLayerLayout(
  layerNodes: { id: string; fanIn: number }[],
  layerEdges: { source: string; target: string; weight: number }[],
): Map<string, { x: number; z: number }> {
  const SPACING = 2.8; // distance between node centers

  const count = layerNodes.length;
  if (count === 0) return new Map();

  // Sort nodes so connected ones are adjacent in the grid.
  // Use a simple adjacency-count sort: high fan-in nodes first (center),
  // then group by most-connected neighbor.
  const adjacency = new Map<string, Set<string>>();
  for (const n of layerNodes) adjacency.set(n.id, new Set());
  for (const e of layerEdges) {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  }

  // BFS-order from the highest fan-in node to keep connected files nearby
  const sorted: string[] = [];
  const visited = new Set<string>();
  const byFanIn = [...layerNodes].sort((a, b) => b.fanIn - a.fanIn);

  for (const seed of byFanIn) {
    if (visited.has(seed.id)) continue;
    const queue = [seed.id];
    visited.add(seed.id);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      sorted.push(curr);
      const neighbors = [...(adjacency.get(curr) ?? [])].filter(n => !visited.has(n));
      // Sort neighbors by fan-in descending so important ones come first
      neighbors.sort((a, b) => {
        const fa = layerNodes.find(n => n.id === a)?.fanIn ?? 0;
        const fb = layerNodes.find(n => n.id === b)?.fanIn ?? 0;
        return fb - fa;
      });
      for (const n of neighbors) {
        visited.add(n);
        queue.push(n);
      }
    }
  }

  // Place in a grid centered on (0, 0)
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.3)));
  const rows = Math.ceil(count / cols);

  const result = new Map<string, { x: number; z: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * SPACING;
    const z = (row - (rows - 1) / 2) * SPACING;
    result.set(sorted[i], { x, z });
  }
  return result;
}

function cityToArchData(city: CitySchema): { ND: NodeDef[]; CO: Conn[]; extent: number } {
  const allBuildings = city.city.districts.flatMap((d) => d.buildings);
  const hotspotSet = new Set(city.city.hotspots ?? []);
  const entrySet = new Set(city.city.entryPoints ?? []);
  const coveredSet = new Set(city.city.testCoverage?.covered ?? []);
  const uncoveredSet = new Set(city.city.testCoverage?.uncovered ?? []);

  const fanInMap: Record<string, number> = {};
  const fanOutMap: Record<string, number> = {};
  const pairSet = new Set<string>();
  for (const r of city.city.roads) {
    fanOutMap[r.from] = (fanOutMap[r.from] || 0) + (r.weight || 1);
    fanInMap[r.to] = (fanInMap[r.to] || 0) + (r.weight || 1);
    pairSet.add(`${r.from}::${r.to}`);
  }

  const circularIds = new Set<string>();
  for (const r of city.city.roads) {
    if (pairSet.has(`${r.to}::${r.from}`)) {
      circularIds.add(r.from);
      circularIds.add(r.to);
    }
  }

  const ND: NodeDef[] = allBuildings.map((b) => {
    const fi = fanInMap[b.id] || 0;
    const fo = fanOutMap[b.id] || 0;
    const covered = coveredSet.has(b.id) || coveredSet.has(b.path) || coveredSet.has(b.filename);
    const uncovered = uncoveredSet.has(b.id) || uncoveredSet.has(b.path) || uncoveredSet.has(b.filename);
    return {
      id: b.id,
      lb: b.filename,
      l: classifyLayer(b.path, b.architecturalRole, b.aiLayer),
      x: 0,
      z: 0,
      loc: b.linesOfCode || 0,
      risk: b.riskScore,
      hotspot: hotspotSet.has(b.id),
      entryPoint: b.entryPoint || entrySet.has(b.id),
      security: b.securitySensitive,
      fanIn: fi,
      fanOut: fo,
      orphan: fi === 0 && fo === 0,
      circular: circularIds.has(b.id),
      colorLabel: b.colorLabel,
      aiSummary: b.aiSummary,
      testCoverage: covered ? "covered" : uncovered ? "uncovered" : "unknown",
    };
  });

  const nodeIds = new Set(ND.map((n) => n.id));
  const CO: Conn[] = city.city.roads
    .filter((r) => nodeIds.has(r.from) && nodeIds.has(r.to) && r.from !== r.to)
    .map((r) => ({
      a: r.from,
      b: r.to,
      type: r.type,
      weight: r.weight || 1,
    }));

  /* --- Force-directed layout per layer --- */
  const byLayer: Record<string, NodeDef[]> = { db: [], be: [], api: [], fe: [] };
  ND.forEach((n) => byLayer[n.l].push(n));

  const layerKeys: ("db" | "be" | "api" | "fe")[] = ["db", "be", "api", "fe"];
  let maxSpread = 0;

  for (const lk of layerKeys) {
    const layerNodes = byLayer[lk];
    if (!layerNodes.length) continue;

    // Collect edges within this layer for force simulation
    const layerNodeIds = new Set(layerNodes.map((n) => n.id));
    const layerEdges = CO
      .filter((c) => layerNodeIds.has(c.a) && layerNodeIds.has(c.b))
      .map((c) => ({ source: c.a, target: c.b, weight: c.weight }));

    const positions = runLayerLayout(
      layerNodes.map((n) => ({ id: n.id, fanIn: n.fanIn ?? 0 })),
      layerEdges,
    );

    for (const n of layerNodes) {
      const pos = positions.get(n.id);
      if (pos) {
        n.x = pos.x;
        n.z = pos.z;
      }
    }

    for (const n of layerNodes) {
      maxSpread = Math.max(maxSpread, Math.abs(n.x), Math.abs(n.z));
    }
  }

  // Grid extent based on actual node spread — platforms must cover all nodes
  const extent = Math.max(14, maxSpread * 2 + 4);

  return { ND, CO, extent };
}

/* ------------------------------------------------------------------ */
/*  LAYER CONFIG                                                       */
/* ------------------------------------------------------------------ */

export const LAYERS: Record<string, { y: number; c: number; name: string }> = {
  db:  { y: -10.5, c: 0xba7517, name: "database" },
  be:  { y: -3.5,  c: 0x1d9e75, name: "backend" },
  api: { y: 3.5,   c: 0x7f77dd, name: "api" },
  fe:  { y: 10.5,  c: 0xd85a30, name: "frontend" },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LAYER_KEYS = ["db", "be", "api", "fe"] as const;
export const FILTER_BUTTONS = [
  { id: "all", label: "All" },
  { id: "db",  label: "Database" },
  { id: "be",  label: "Backend" },
  { id: "api", label: "API" },
  { id: "fe",  label: "Frontend" },
];

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

/** Strip common extensions from filename for label display */
function stripExtension(name: string): string {
  return name.replace(/\.(tsx?|jsx?|mjs|cjs)$/i, "");
}

/** Clamp a value between min and max */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Get risk-based color for a node */
function getRiskColor(risk: number | undefined, layerColor: number): number {
  if (risk === undefined) return layerColor;
  if (risk > 60) return 0xdc2626;
  if (risk > 30) return 0xd97706;
  return 0x16a34a;
}

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  onSelect?: (sel: ArchSelection | null) => void;
  city?: CitySchema | null;
  highlightNodeId?: string | null;
  onHighlightConsumed?: () => void;
  controlledFilters?: Set<string>;
  /** Which edge types to show. "all" = progressive disclosure default. Otherwise filter to specific types. */
  controlledEdgeFilter?: string;
}

/**
 * State machine for progressive connection disclosure.
 * - "default": Only cross-layer + circular edges visible
 * - "hover":   1-hop edges from hovered node (+ cross-layer + circular)
 * - "selected": 2-hop neighborhood from selected node
 */
type DisclosureState = "default" | "hover" | "selected";

export default function ArchitectureMap({ onSelect, city, highlightNodeId, onHighlightConsumed, controlledFilters, controlledEdgeFilter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["all"]));
  const [hoverCard, setHoverCard] = useState<{
    x: number;
    y: number;
    filename: string;
    layer: string;
    layerColor: string;
    summary: string;
    fanIn: number;
    fanOut: number;
    risk: number;
    loc: number;
    readNext: string;
  } | null>(null);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /* compute nodes/connections from repo data or fall back to static */
  const archData = useMemo(() => {
    if (city) return cityToArchData(city);
    return { ND: STATIC_ND, CO: STATIC_CO, extent: 22 };
  }, [city]);
  const ND = archData.ND;
  const CO = archData.CO;
  const extent = archData.extent;
  const coRef = useRef(CO);
  coRef.current = CO;
  const ndRef = useRef(ND);
  ndRef.current = ND;

  const strongestOutbound = useMemo(() => {
    const byId = new Map<string, NodeDef>(ND.map((n) => [n.id, n]));
    const out = new Map<string, string>();
    ND.forEach((node) => {
      const best = CO
        .filter((c) => c.a === node.id)
        .sort((x, y) => y.weight - x.weight)[0];
      if (best) {
        out.set(node.id, byId.get(best.b)?.lb || best.b);
      }
    });
    return out;
  }, [ND, CO]);

  /* Precompute adjacency for 2-hop neighborhood lookups */
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    CO.forEach((c) => {
      if (!map.has(c.a)) map.set(c.a, new Set());
      if (!map.has(c.b)) map.set(c.b, new Set());
      map.get(c.a)!.add(c.b);
      map.get(c.b)!.add(c.a);
    });
    return map;
  }, [CO]);

  /** Get 2-hop neighborhood node ids */
  const get2HopNeighborhood = useCallback((nodeId: string): Set<string> => {
    const result = new Set<string>([nodeId]);
    const hop1 = adjacency.get(nodeId);
    if (hop1) {
      hop1.forEach((id) => {
        result.add(id);
        const hop2 = adjacency.get(id);
        if (hop2) hop2.forEach((id2) => result.add(id2));
      });
    }
    return result;
  }, [adjacency]);

  /* refs for mutable scene state (avoid re-renders inside rAF loop) */
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    css2dRenderer: CSS2DRenderer;
    scene: THREE.Scene;
    cam: THREE.PerspectiveCamera;
    mm: Record<string, THREE.Mesh>;
    ml: THREE.Mesh[];
    tubes: THREE.Mesh[];
    tubeData: {
      mesh: THREE.Mesh;
      a: string;
      b: string;
      type: ConnType;
      weight: number;
      material: THREE.MeshStandardMaterial;
      baseColor: number;
      curve: THREE.QuadraticBezierCurve3;
    }[];
    css2dLabels: { obj: CSS2DObject; nodeId: string; el: HTMLDivElement }[];
    cr: { curve: THREE.QuadraticBezierCurve3; a: string; b: string; type: ConnType; weight: number }[];
    pts: { m: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; s: number }[];
    layerLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[];
    ph: number;
    th: number;
    rr: number;
    tx: number;
    ty: number;
    tz: number;
    gtx: number;
    gty: number;
    gtz: number;
    grr: number;
    pan: boolean;
    drag: boolean;
    lx: number;
    ly: number;
    dd: number;
    hasDrag: boolean;
    hov: THREE.Mesh | null;
    sel: THREE.Mesh | null;
    filter: string;
    lt: number;
    W: number;
    H: number;
    animId: number;
    disclosure: DisclosureState;
    hoveredId: string | null;
    selectedId: string | null;
  } | null>(null);

  const filterRef = useRef(activeFilters);
  filterRef.current = activeFilters;

  const edgeFilterRef = useRef(controlledEdgeFilter ?? "all");
  edgeFilterRef.current = controlledEdgeFilter ?? "all";

  const applyDisclosureRef = useRef<(() => void) | null>(null);

  /* ---- updateCamera helper ---- */
  const updateCamera = useCallback((s: NonNullable<typeof sceneRef.current>) => {
    s.cam.position.set(
      s.tx + s.rr * Math.sin(s.ph) * Math.sin(s.th),
      s.ty + s.rr * Math.cos(s.ph),
      s.tz + s.rr * Math.sin(s.ph) * Math.cos(s.th),
    );
    s.cam.lookAt(s.tx, s.ty, s.tz);
  }, []);

  /* ---- Apply progressive connection disclosure ---- */
  const applyDisclosure = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;

    const { disclosure, hoveredId, selectedId } = s;
    const edgeFilter = edgeFilterRef.current; // "all" | "import" | "cross-layer" | "circular" | "type-import"

    // Helper: should this edge type be visible given the current edge filter?
    const typePassesFilter = (type: ConnType) => {
      if (edgeFilter === "all") return true;
      return type === edgeFilter;
    };

    if (disclosure === "default") {
      if (edgeFilter === "all") {
        // Progressive disclosure: only cross-layer + circular
        s.tubeData.forEach(({ mesh, type, material, baseColor }) => {
          if (type === "cross-layer") {
            mesh.visible = true;
            material.color.setHex(baseColor);
            material.opacity = 0.55;
          } else if (type === "circular") {
            mesh.visible = true;
            material.color.setHex(baseColor);
            material.opacity = 0.50;
          } else {
            mesh.visible = false;
          }
        });
      } else {
        // Specific edge type filter — show ONLY edges of that type
        const connectedNodes = new Set<string>();
        s.tubeData.forEach(({ mesh, a, b, type, material, baseColor }) => {
          if (typePassesFilter(type)) {
            mesh.visible = true;
            material.color.setHex(baseColor);
            material.opacity = type === "circular" ? 0.5 : 0.6;
            connectedNodes.add(a);
            connectedNodes.add(b);
          } else {
            mesh.visible = false;
          }
        });
        // Dim nodes not involved in filtered edges
        s.ml.forEach((m) => {
          const nid = (m.userData as { id: string }).id;
          (m.material as THREE.MeshStandardMaterial).opacity = connectedNodes.has(nid) ? 0.95 : 0.12;
        });
        return; // skip default node opacity reset
      }
      // All nodes full opacity (for "all" default)
      s.ml.forEach((m) => {
        (m.material as THREE.MeshStandardMaterial).opacity = 0.88;
      });
    } else if (disclosure === "hover" && hoveredId) {
      const directNeighbors = new Set<string>();
      s.tubeData.forEach(({ mesh, a, b, type, material, baseColor }) => {
        const isHoveredEdge = a === hoveredId || b === hoveredId;
        if ((type === "cross-layer" || type === "circular") && typePassesFilter(type)) {
          mesh.visible = true;
          material.color.setHex(baseColor);
          material.opacity = type === "circular" ? 0.50 : 0.55;
        } else if (isHoveredEdge && typePassesFilter(type)) {
          mesh.visible = true;
          if (a === hoveredId) {
            material.color.setHex(0x22d3ee); // cyan fan-out
            directNeighbors.add(b);
          } else {
            material.color.setHex(0xf59e0b); // amber fan-in
            directNeighbors.add(a);
          }
          material.opacity = 0.75;
        } else {
          mesh.visible = false;
        }
      });
      s.ml.forEach((m) => {
        const nid = (m.userData as { id: string }).id;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.opacity = (nid === hoveredId || directNeighbors.has(nid)) ? 1.0 : 0.15;
      });
    } else if (disclosure === "selected" && selectedId) {
      // Only direct (1-hop) connections stay highlighted
      const directNeighbors = new Set<string>([selectedId]);
      s.tubeData.forEach(({ mesh, a, b, type, material }) => {
        const isSelectedEdge = a === selectedId || b === selectedId;
        if (isSelectedEdge && typePassesFilter(type)) {
          mesh.visible = true;
          if (a === selectedId) {
            material.color.setHex(0x22d3ee); // cyan fan-out
            directNeighbors.add(b);
          } else {
            material.color.setHex(0xf59e0b); // amber fan-in
            directNeighbors.add(a);
          }
          material.opacity = 0.75;
        } else {
          mesh.visible = false;
        }
      });
      s.ml.forEach((m) => {
        const nid = (m.userData as { id: string }).id;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.opacity = directNeighbors.has(nid) ? 1.0 : 0.08;
      });
    }

    // Update CSS2D labels: selected label bold/bright, hotspot prefix, entry prefix
    s.css2dLabels.forEach(({ nodeId, el }) => {
      const nd = ndRef.current.find((n) => n.id === nodeId);
      const isSelected = selectedId === nodeId;
      const baseName = stripExtension(nd?.lb ?? nodeId);
      let prefix = "";
      if (nd?.hotspot) prefix = "\u26A0 "; // red warning
      else if (nd?.entryPoint) prefix = "\u2B1F "; // cyan pentagon

      if (isSelected) {
        el.style.fontSize = "13px";
        el.style.fontWeight = "bold";
        el.style.background = "rgba(0,0,0,0.85)";
        el.style.color = "#ffffff";
      } else {
        el.style.fontSize = "11px";
        el.style.fontWeight = "normal";
        el.style.background = "rgba(0,0,0,0.6)";
        el.style.color = "#ffffff";
      }

      el.textContent = prefix + baseName;

      // Hotspot prefix styling
      if (nd?.hotspot && prefix) {
        el.innerHTML = `<span style="color:#ef4444">\u26A0 </span>${baseName}`;
      } else if (nd?.entryPoint && prefix) {
        el.innerHTML = `<span style="color:#22d3ee">\u2B1F </span>${baseName}`;
      }
    });
  }, [get2HopNeighborhood]);

  // Keep ref in sync so external effects can call it
  applyDisclosureRef.current = applyDisclosure;

  // React to edge filter changes from page
  useEffect(() => {
    applyDisclosure();
  }, [controlledEdgeFilter, applyDisclosure]);

  /* ---- selection logic ---- */
  const doSel = useCallback((mesh: THREE.Mesh | null) => {
    const s = sceneRef.current;
    if (!s) return;
    s.sel = mesh;

    if (mesh) {
      const ud = mesh.userData as { id: string; lb: string; lname: string };
      const connPairs = coRef.current.filter((c) => c.a === ud.id || c.b === ud.id);
      const cnt = connPairs.length;

      const connectedIds = connPairs.map((c) => (c.a === ud.id ? c.b : c.a));
      const connectedLabels = connectedIds
        .map((cid) => ndRef.current.find((n) => n.id === cid)?.lb)
        .filter(Boolean) as string[];

      onSelectRef.current?.({
        id: ud.id,
        label: ud.lb,
        layer: ud.lname,
        connectionCount: cnt,
        connectedTo: connectedLabels,
      });

      s.disclosure = "selected";
      s.selectedId = ud.id;
      applyDisclosure();

      s.gtx = mesh.position.x;
      s.gty = mesh.position.y;
      s.gtz = mesh.position.z;
      s.grr = Math.min(s.rr, 20);
    } else {
      onSelectRef.current?.(null);

      s.disclosure = "default";
      s.selectedId = null;
      s.hoveredId = null;
      applyDisclosure();

      s.gtx = s.tx;
      s.gty = s.ty;
      s.gtz = s.tz;
    }
  }, [applyDisclosure]);

  /* ---- filter logic ---- */
  const applyFilter = useCallback((filters: Set<string>) => {
    const s = sceneRef.current;
    if (!s) return;
    const showAll = filters.has("all");
    s.ml.forEach((m) => {
      m.visible = showAll || filters.has((m.userData as { l: string }).l);
    });
  }, []);

  /* ---- sync from controlled filters prop ---- */
  useEffect(() => {
    if (controlledFilters) {
      setActiveFilters(controlledFilters);
      applyFilter(controlledFilters);
    }
  }, [controlledFilters, applyFilter]);

  const projectHoverCard = useCallback(
    (mesh: THREE.Mesh | null) => {
      const s = sceneRef.current;
      const container = containerRef.current;
      if (!s || !container || !mesh) {
        setHoverCard(null);
        return;
      }
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      const projected = worldPos.clone().project(s.cam);
      const x = (projected.x * 0.5 + 0.5) * s.W;
      const y = (-projected.y * 0.5 + 0.5) * s.H;
      const ud = mesh.userData as {
        lb: string;
        lname: string;
        layerColor: number;
        aiSummary?: string;
        fanIn?: number;
        fanOut?: number;
        risk?: number;
        loc?: number;
        readNext?: string;
      };
      const summary = (ud.aiSummary || "No summary yet").trim();
      const clippedSummary = summary.length > 100 ? `${summary.slice(0, 100)}...` : summary;
      setHoverCard({
        x,
        y,
        filename: ud.lb,
        layer: ud.lname,
        layerColor: `#${ud.layerColor.toString(16).padStart(6, "0")}`,
        summary: clippedSummary || "No summary yet",
        fanIn: ud.fanIn || 0,
        fanOut: ud.fanOut || 0,
        risk: ud.risk || 0,
        loc: ud.loc || 0,
        readNext: ud.readNext || "None",
      });
    },
    [],
  );

  /* ---- scene init ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let W = container.clientWidth || 680;
    let H = container.clientHeight || 560;

    /* WebGL renderer */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x080c14);

    /* CSS2D renderer layered on top */
    const css2dRenderer = new CSS2DRenderer();
    css2dRenderer.setSize(W, H);
    css2dRenderer.domElement.style.position = "absolute";
    css2dRenderer.domElement.style.top = "0";
    css2dRenderer.domElement.style.left = "0";
    css2dRenderer.domElement.style.pointerEvents = "none";
    css2dRenderer.domElement.style.width = "100%";
    css2dRenderer.domElement.style.height = "100%";
    container.appendChild(css2dRenderer.domElement);

    /* Overlay div for layer labels and hover card (already positioned in JSX via containerRef) */
    const overlayDiv = document.createElement("div");
    overlayDiv.style.position = "absolute";
    overlayDiv.style.top = "0";
    overlayDiv.style.left = "0";
    overlayDiv.style.width = "100%";
    overlayDiv.style.height = "100%";
    overlayDiv.style.pointerEvents = "none";
    overlayDiv.style.overflow = "hidden";
    container.appendChild(overlayDiv);

    /* scene + camera */
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(52, W / H, 0.1, Math.max(500, extent * 4));

    const gridExtent = Math.max(extent, 14);
    const gridDivisions = Math.max(8, Math.round(gridExtent / 3));

    /* lights */
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(10, 16, 8);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0x4466ff, 0.3);
    dl2.position.set(-8, -4, -6);
    scene.add(dl2);

    /* layer platforms — solid slabs with grid on top */
    const PLATFORM_THICKNESS = 0.15;
    Object.values(LAYERS).forEach((l) => {
      // Solid platform slab
      const slabGeo = new THREE.BoxGeometry(gridExtent, PLATFORM_THICKNESS, gridExtent);
      const slabMat = new THREE.MeshStandardMaterial({
        color: l.c,
        transparent: true,
        opacity: 0.18,
        metalness: 0.3,
        roughness: 0.8,
      });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.y = l.y - PLATFORM_THICKNESS / 2;
      slab.receiveShadow = true;
      scene.add(slab);

      // Grid lines on top of the slab
      const g = new THREE.GridHelper(gridExtent, gridDivisions, l.c, l.c);
      (g.material as THREE.Material).opacity = 0.12;
      (g.material as THREE.Material).transparent = true;
      g.position.y = l.y + 0.01;
      scene.add(g);

      // Thin edge border ring to make the platform edges visible
      const edgeGeo = new THREE.EdgesGeometry(slabGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color: l.c, transparent: true, opacity: 0.25 });
      const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLine.position.y = l.y - PLATFORM_THICKNESS / 2;
      scene.add(edgeLine);
    });

    /* nodes */
    const mm: Record<string, THREE.Mesh> = {};
    const ml: THREE.Mesh[] = [];
    const markerMeshes: THREE.Mesh[] = [];
    const markerMaterials: THREE.Material[] = [];
    const markerGeometries: THREE.BufferGeometry[] = [];
    const entryRingMaterials: THREE.MeshBasicMaterial[] = [];
    const css2dLabels: { obj: CSS2DObject; nodeId: string; el: HTMLDivElement }[] = [];

    ND.forEach((n) => {
      const ly = LAYERS[n.l];
      const h = n.loc ? Math.max(0.25, Math.min(1.6, Math.sqrt(n.loc) * 0.045)) : 0.3;

      const nodeColor = getRiskColor(n.risk, ly.c);
      let emissiveColor = 0x000000;
      let emissiveIntensity = 0;
      if (n.risk !== undefined) {
        if (n.risk > 60) { emissiveColor = 0xff2222; emissiveIntensity = 0.15; }
        else if (n.risk > 30) { emissiveColor = 0xffaa00; emissiveIntensity = 0.08; }
      }
      if (n.hotspot) { emissiveColor = 0xff4444; emissiveIntensity = 0.35; }

      const w = Math.min(0.7 + (n.fanIn || 0) * 0.05, 1.4);
      const d = n.hotspot ? 0.6 : 0.5;

      /* Single solid-color MeshStandardMaterial per node (no baked textures) */
      const mat = new THREE.MeshStandardMaterial({
        color: nodeColor,
        emissive: emissiveColor,
        emissiveIntensity,
        metalness: 0.15,
        roughness: 0.6,
        transparent: true,
        opacity: 0.88,
      });

      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(n.x, ly.y + h / 2, n.z);
      m.frustumCulled = false;
      m.userData = {
        id: n.id,
        lb: n.lb,
        l: n.l,
        lname: ly.name,
        layerColor: ly.c,
        risk: n.risk,
        hotspot: n.hotspot,
        entryPoint: n.entryPoint,
        security: n.security,
        circular: n.circular,
        orphan: n.orphan,
        fanIn: n.fanIn,
        fanOut: n.fanOut,
        loc: n.loc,
        aiSummary: n.aiSummary,
        readNext: strongestOutbound.get(n.id),
      };
      scene.add(m);
      mm[n.id] = m;
      ml.push(m);

      /* CSS2D label */
      const labelDiv = document.createElement("div");
      labelDiv.style.color = "#ffffff";
      labelDiv.style.fontSize = "11px";
      labelDiv.style.fontFamily = "system-ui, -apple-system, sans-serif";
      labelDiv.style.background = "rgba(0,0,0,0.6)";
      labelDiv.style.borderRadius = "4px";
      labelDiv.style.padding = "1px 5px";
      labelDiv.style.whiteSpace = "nowrap";
      labelDiv.style.pointerEvents = "none";
      labelDiv.style.userSelect = "none";
      labelDiv.dataset.nodeId = n.id;

      const baseName = stripExtension(n.lb);

      if (n.hotspot) {
        labelDiv.innerHTML = `<span style="color:#ef4444">\u26A0 </span>${baseName}`;
      } else if (n.entryPoint) {
        labelDiv.innerHTML = `<span style="color:#22d3ee">\u2B1F </span>${baseName}`;
      } else {
        labelDiv.textContent = baseName;
      }

      const css2dObj = new CSS2DObject(labelDiv);
      css2dObj.position.set(0, h / 2 + 0.3, 0);
      m.add(css2dObj);
      css2dLabels.push({ obj: css2dObj, nodeId: n.id, el: labelDiv });

      /* entry point ring marker */
      if (n.entryPoint) {
        const ringGeoA = new THREE.RingGeometry(0.72, 0.88, 24);
        const ringMatA = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.62 });
        const ringA = new THREE.Mesh(ringGeoA, ringMatA);
        ringA.rotation.x = -Math.PI / 2;
        ringA.position.set(n.x, ly.y + h + 0.08, n.z);
        scene.add(ringA);

        const ringGeoB = new THREE.RingGeometry(0.9, 1.06, 24);
        const ringMatB = new THREE.MeshBasicMaterial({ color: 0x67e8f9, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
        const ringB = new THREE.Mesh(ringGeoB, ringMatB);
        ringB.rotation.x = -Math.PI / 2;
        ringB.position.set(n.x, ly.y + h + 0.1, n.z);
        scene.add(ringB);

        entryRingMaterials.push(ringMatA, ringMatB);
        markerMeshes.push(ringA, ringB);
        markerMaterials.push(ringMatA, ringMatB);
        markerGeometries.push(ringGeoA, ringGeoB);
      }

      /* test coverage marker */
      if (n.testCoverage === "covered" || n.testCoverage === "uncovered") {
        const dotGeo = new THREE.SphereGeometry(0.12, 10, 10);
        const dotMat = new THREE.MeshBasicMaterial({ color: n.testCoverage === "covered" ? 0x4ade80 : 0xfbbf24 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(n.x + w / 2 - 0.08, ly.y + h - 0.1, n.z + d / 2 + 0.06);
        scene.add(dot);
        markerMeshes.push(dot);
        markerMaterials.push(dotMat);
        markerGeometries.push(dotGeo);
      }

      /* security shield marker */
      if (n.security) {
        const shieldGeo = new THREE.SphereGeometry(0.15, 6, 6);
        const shieldMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(n.x + w / 2 + 0.2, ly.y + h, n.z);
        scene.add(shield);
        markerMeshes.push(shield);
        markerMaterials.push(shieldMat);
        markerGeometries.push(shieldGeo);
      }
    });

    /* ---- Tube-based connections ---- */
    const tubes: THREE.Mesh[] = [];
    const tubeData: typeof sceneRef.current extends null ? never : NonNullable<typeof sceneRef.current>["tubeData"] = [];
    const tubeGeometries: THREE.BufferGeometry[] = [];
    const tubeMaterials: THREE.MeshStandardMaterial[] = [];
    const cr: { curve: THREE.QuadraticBezierCurve3; a: string; b: string; type: ConnType; weight: number }[] = [];

    // Precompute node layer map for edge coloring

    CO.forEach((conn, i) => {
      const { a, b, type, weight } = conn;
      const ma = mm[a];
      const mb = mm[b];
      if (!ma || !mb) return;
      const pa = ma.position;
      const pb = mb.position;
      const ctrl = new THREE.Vector3(
        (pa.x + pb.x) / 2 + Math.sin(i * 2.13) * 2.2,
        (pa.y + pb.y) / 2,
        (pa.z + pb.z) / 2 + Math.cos(i * 1.71) * 2.2,
      );
      const curve = new THREE.QuadraticBezierCurve3(pa.clone(), ctrl, pb.clone());
      cr.push({ curve, a, b, type, weight });

      // Tube radius scales with weight, capped
      const tubeRadius = Math.min(0.025 + weight * 0.012, 0.12);
      const tubeGeo = new THREE.TubeGeometry(curve, 30, tubeRadius, 6, false);

      // Fixed color per connection type — no per-edge variation
      const CONN_COLORS: Record<ConnType, { color: number; opacity: number }> = {
        "cross-layer": { color: 0x7f77dd, opacity: 0.50 },
        "circular":    { color: 0xef4444, opacity: 0.50 },
        "type-import": { color: 0x888888, opacity: 0.30 },
        "import":      { color: 0x3b82f6, opacity: 0.35 },
      };
      const style = CONN_COLORS[type] ?? CONN_COLORS.import;
      const tubeColor = style.color;
      const tubeOpacity = style.opacity;

      const tubeMat = new THREE.MeshStandardMaterial({
        color: tubeColor,
        transparent: true,
        opacity: tubeOpacity,
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
      });

      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.frustumCulled = false;

      // Initially, only cross-layer and circular edges are visible
      if (type !== "cross-layer" && type !== "circular") {
        tubeMesh.visible = false;
      }

      scene.add(tubeMesh);
      tubes.push(tubeMesh);
      tubeGeometries.push(tubeGeo);
      tubeMaterials.push(tubeMat);
      tubeData.push({
        mesh: tubeMesh,
        a, b, type, weight,
        material: tubeMat,
        baseColor: tubeColor,
        curve,
      });
    });

    /* animated particles -- share geometry + material per layer */
    const pts2: { m: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; s: number }[] = [];
    const particleGeo = new THREE.SphereGeometry(0.07, 5, 5);
    const particleMatCache: Record<number, THREE.MeshBasicMaterial> = {};
    cr.forEach(({ curve, b: bId }) => {
      const tly = LAYERS[ND.find((n) => n.id === bId)?.l || "api"];
      const col = tly?.c || 0x4af0d0;
      if (!particleMatCache[col]) particleMatCache[col] = new THREE.MeshBasicMaterial({ color: col });
      for (let pi = 0; pi < 2; pi++) {
        const pm = new THREE.Mesh(particleGeo, particleMatCache[col]);
        scene.add(pm);
        pts2.push({ m: pm, curve, t: Math.random(), s: 0.11 + Math.random() * 0.1 });
      }
    });

    /* layer name labels — positioned right of the node cluster */
    const layerLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
    for (const [lk, ly] of Object.entries(LAYERS)) {
      // Find rightmost node in this layer to position label nearby
      const layerMeshes = ND.filter(n => n.l === lk);
      const maxX = layerMeshes.reduce((mx, n) => Math.max(mx, n.x), 0);
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.fontSize = "14px";
      el.style.fontWeight = "800";
      el.style.letterSpacing = "0.12em";
      el.style.textTransform = "uppercase";
      el.style.color = `#${ly.c.toString(16).padStart(6, "0")}`;
      el.style.textShadow = `0 0 12px ${`#${ly.c.toString(16).padStart(6, "0")}`}44, 0 1px 4px rgba(0,0,0,0.8)`;
      el.style.pointerEvents = "none";
      el.style.whiteSpace = "nowrap";
      el.textContent = ly.name.toUpperCase();
      overlayDiv.appendChild(el);
      layerLabels.push({ el, pos: new THREE.Vector3(maxX + 3, ly.y, 0) });
    }

    /* state object */
    const initialRr = Math.max(32, Math.min(50, gridExtent * 1.4));
    const s: NonNullable<typeof sceneRef.current> = {
      renderer,
      css2dRenderer,
      scene,
      cam,
      mm,
      ml,
      tubes,
      tubeData,
      css2dLabels,
      cr,
      pts: pts2,
      layerLabels,
      ph: 0.72,
      th: 0.55,
      rr: initialRr,
      tx: 0,
      ty: 0,
      tz: 0,
      gtx: 0,
      gty: 0,
      gtz: 0,
      grr: initialRr,
      pan: false,
      drag: false,
      lx: 0,
      ly: 0,
      dd: 0,
      hasDrag: false,
      hov: null,
      sel: null,
      filter: "all",
      lt: 0,
      W,
      H,
      animId: 0,
      disclosure: "default",
      hoveredId: null,
      selectedId: null,
    };
    sceneRef.current = s;
    updateCamera(s);

    /* raycaster helpers */
    const rc = new THREE.Raycaster();
    const mv = new THREE.Vector2();

    function getUV(e: MouseEvent): [number, number] {
      const r = canvas!.getBoundingClientRect();
      return [
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ];
    }
    function pick(uv: [number, number]) {
      mv.set(uv[0], uv[1]);
      rc.setFromCamera(mv, cam);
      const h = rc.intersectObjects(ml);
      return h.length ? (h[0].object as THREE.Mesh) : null;
    }

    /* ---- event handlers ---- */
    function onMouseDown(e: MouseEvent) {
      s.drag = true;
      s.pan = e.button === 2 || e.button === 1;
      s.lx = e.clientX;
      s.ly = e.clientY;
      s.dd = 0;
      s.hasDrag = false;
      canvas!.style.cursor = s.pan ? "move" : "grabbing";
    }
    function onMouseMove(e: MouseEvent) {
      if (s.drag) {
        s.dd += Math.abs(e.clientX - s.lx) + Math.abs(e.clientY - s.ly);
        if (s.dd > 4) s.hasDrag = true;
        if (s.pan || e.ctrlKey || e.metaKey) {
          s.cam.updateMatrixWorld(true);
          const right = new THREE.Vector3().setFromMatrixColumn(s.cam.matrixWorld, 0).normalize();
          const up = new THREE.Vector3().setFromMatrixColumn(s.cam.matrixWorld, 1).normalize();
          const panSpeed = s.rr * 0.002;
          const dx = -(e.clientX - s.lx) * panSpeed;
          const dy = (e.clientY - s.ly) * panSpeed;
          s.tx += right.x * dx + up.x * dy;
          s.ty += right.y * dx + up.y * dy;
          s.tz += right.z * dx + up.z * dy;
          s.gtx = s.tx; s.gty = s.ty; s.gtz = s.tz;
        } else {
          s.th -= (e.clientX - s.lx) * 0.007;
          s.ph = Math.max(0.16, Math.min(1.46, s.ph - (e.clientY - s.ly) * 0.007));
        }
        s.lx = e.clientX;
        s.ly = e.clientY;
        updateCamera(s);
      } else {
        const uv = getUV(e);
        if (uv[0] >= -1 && uv[0] <= 1 && uv[1] >= -1 && uv[1] <= 1) {
          const hovered = pick(uv);
          if (hovered !== s.hov) {
            s.hov = hovered;
            projectHoverCard(hovered);

            // Progressive disclosure: hover state
            if (!s.sel) {
              if (hovered) {
                s.disclosure = "hover";
                s.hoveredId = (hovered.userData as { id: string }).id;
              } else {
                s.disclosure = "default";
                s.hoveredId = null;
              }
              applyDisclosure();
            }
          }
          canvas!.style.cursor = s.hov ? "pointer" : "grab";
        } else if (s.hov) {
          s.hov = null;
          projectHoverCard(null);
          if (!s.sel) {
            s.disclosure = "default";
            s.hoveredId = null;
            applyDisclosure();
          }
        }
      }
    }
    function onMouseUp() {
      s.drag = false;
      s.pan = false;
      canvas!.style.cursor = s.hov ? "pointer" : "grab";
    }
    function onClick(e: MouseEvent) {
      if (!s.hasDrag) {
        const uv = getUV(e);
        doSel(pick(uv));
      }
    }
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      s.rr = Math.max(8, Math.min(120, s.rr + e.deltaY * 0.08));
      s.grr = s.rr;
      updateCamera(s);
    }
    function onTouchStart(e: TouchEvent) {
      s.drag = true;
      s.lx = e.touches[0].clientX;
      s.ly = e.touches[0].clientY;
      s.dd = 0;
      s.hasDrag = false;
    }
    function onTouchMove(e: TouchEvent) {
      if (!s.drag || !e.touches.length) return;
      s.dd += Math.abs(e.touches[0].clientX - s.lx) + Math.abs(e.touches[0].clientY - s.ly);
      if (s.dd > 4) s.hasDrag = true;
      s.th -= (e.touches[0].clientX - s.lx) * 0.007;
      s.ph = Math.max(0.16, Math.min(1.46, s.ph - (e.touches[0].clientY - s.ly) * 0.007));
      s.lx = e.touches[0].clientX;
      s.ly = e.touches[0].clientY;
      updateCamera(s);
    }
    function onTouchEnd() {
      s.drag = false;
    }
    function onContextMenu(e: Event) { e.preventDefault(); }

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    /* ResizeObserver for container size tracking */
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          s.W = width;
          s.H = height;
          renderer.setSize(width, height);
          css2dRenderer.setSize(width, height);
          cam.aspect = width / height;
          cam.updateProjectionMatrix();
        }
      }
    });
    resizeObserver.observe(container);

    /* ---- animation loop ---- */
    const tv = new THREE.Vector3();

    function loop(t: number) {
      s.animId = requestAnimationFrame(loop);
      const dt = Math.min((t - s.lt) / 1000, 0.05);
      s.lt = t;

      /* smooth camera target & zoom animation */
      const lf = 1 - Math.pow(0.02, dt);
      let camMoved = false;
      if (Math.abs(s.tx - s.gtx) > 0.01 || Math.abs(s.ty - s.gty) > 0.01 || Math.abs(s.tz - s.gtz) > 0.01) {
        s.tx += (s.gtx - s.tx) * lf;
        s.ty += (s.gty - s.ty) * lf;
        s.tz += (s.gtz - s.tz) * lf;
        camMoved = true;
      }
      if (Math.abs(s.rr - s.grr) > 0.05) {
        s.rr += (s.grr - s.rr) * lf;
        camMoved = true;
      }

      /* auto-rotate */
      if (!s.drag && !s.sel) {
        s.th += dt * 0.035;
        camMoved = true;
      }
      if (camMoved) updateCamera(s);

      /* particles */
      s.pts.forEach((p) => {
        p.t = (p.t + dt * p.s) % 1;
        p.m.position.copy(p.curve.getPoint(p.t));
      });

      /* pulse entry rings */
      for (let i = 0; i < entryRingMaterials.length; i++) {
        entryRingMaterials[i].opacity = 0.34 + 0.34 * (0.5 + Math.sin(t * 0.004 + i * 0.8) * 0.5);
      }

      /* Animate circular edge tubes (texture scroll effect via color pulsing) */
      s.tubeData.forEach(({ type, material }) => {
        if (type === "circular" && material.visible !== false) {
          const pulse = 0.4 + 0.1 * Math.sin(t * 0.005);
          material.opacity = pulse;
        }
      });

      /* CSS2D label: distance-based per-label visibility.
         Only labels close to the camera target AND within zoom range are shown.
         This prevents the label soup effect. */
      const camDist = s.cam.position.distanceTo(new THREE.Vector3(s.tx, s.ty, s.tz));
      const globalFade = clamp((45 - camDist) / 20, 0, 1);
      const camTarget = new THREE.Vector3(s.tx, s.ty, s.tz);

      s.css2dLabels.forEach(({ el, obj }) => {
        if (globalFade < 0.01) {
          el.style.opacity = "0";
          return;
        }
        // Distance from this label's world position to camera look-at target
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        const distToTarget = worldPos.distanceTo(camTarget);
        // Labels within 8 units of camera target: full, then fade to 0 by 16 units
        const proximityFade = clamp((20 - distToTarget) / 10, 0, 1);
        // Selected/hovered labels always visible when zoomed in
        const isSelected = s.selectedId === el.dataset.nodeId;
        const finalOpacity = isSelected ? globalFade : globalFade * proximityFade;
        el.style.opacity = String(finalOpacity);
      });

      /* layer name labels -- projected onto 2D overlay */
      s.layerLabels.forEach(({ el, pos }) => {
        tv.copy(pos).project(cam);
        if (tv.z > 1) { el.style.display = "none"; return; }
        el.style.display = "";
        el.style.left = (tv.x * 0.5 + 0.5) * s.W + "px";
        el.style.top = (-tv.y * 0.5 + 0.5) * s.H + "px";
      });

      renderer.render(scene, cam);
      css2dRenderer.render(scene, cam);

      /* ── Minimap rendering ── */
      const mmCanvas = minimapRef.current;
      if (mmCanvas) {
        const mctx = mmCanvas.getContext("2d");
        if (mctx) {
          const MW = mmCanvas.width;
          const MH = mmCanvas.height;
          mctx.clearRect(0, 0, MW, MH);
          mctx.fillStyle = "rgba(7,13,23,0.85)";
          mctx.fillRect(0, 0, MW, MH);

          // Map world XZ to minimap pixels. Use extent to determine scale.
          const mapExtent = gridExtent * 0.55;
          const scaleX = MW / (mapExtent * 2);
          const scaleZ = MH / (mapExtent * 2);

          // Draw all nodes as dots
          const ndLocal = ndRef.current;
          for (let i = 0; i < ndLocal.length; i++) {
            const n = ndLocal[i];
            const mesh = s.mm[n.id];
            if (!mesh || !mesh.visible) continue;
            const wx = mesh.position.x;
            const wz = mesh.position.z;
            const mx = MW / 2 + wx * scaleX;
            const my = MH / 2 + wz * scaleZ;
            const layerCfg = LAYERS[n.l];
            const c = layerCfg ? layerCfg.c : 0x888888;
            mctx.fillStyle = `#${c.toString(16).padStart(6, "0")}`;
            mctx.beginPath();
            mctx.arc(mx, my, 2, 0, Math.PI * 2);
            mctx.fill();
          }

          // Draw viewport rectangle (project camera frustum center + approximate FOV bounds)
          const camX = MW / 2 + s.tx * scaleX;
          const camZ = MH / 2 + s.tz * scaleZ;
          const viewSize = Math.max(6, (s.rr / mapExtent) * MW * 0.3);
          mctx.strokeStyle = "rgba(103,232,249,0.6)";
          mctx.lineWidth = 1;
          mctx.strokeRect(camX - viewSize / 2, camZ - viewSize / 2, viewSize, viewSize);
        }
      }
    }

    s.animId = requestAnimationFrame(loop);

    /* cleanup */
    return () => {
      cancelAnimationFrame(s.animId);
      resizeObserver.disconnect();
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);

      // Dispose nodes
      s.ml.forEach((m: THREE.Mesh) => {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat: THREE.Material) => {
          mat.dispose();
        });
      });
      // Dispose tubes
      tubeGeometries.forEach((g) => g.dispose());
      tubeMaterials.forEach((m) => m.dispose());
      // Dispose markers
      markerMeshes.forEach((m) => { s.scene.remove(m); });
      markerGeometries.forEach((g) => g.dispose());
      markerMaterials.forEach((m) => m.dispose());
      // Dispose particles
      particleGeo.dispose();
      Object.values(particleMatCache).forEach((m) => m.dispose());
      // Dispose CSS2D labels
      css2dLabels.forEach(({ obj }) => {
        if (obj.parent) obj.parent.remove(obj);
      });

      setHoverCard(null);
      renderer.dispose();

      // Remove CSS2D renderer DOM element
      if (css2dRenderer.domElement.parentNode) {
        css2dRenderer.domElement.parentNode.removeChild(css2dRenderer.domElement);
      }
      // Remove overlay div
      if (overlayDiv.parentNode) {
        overlayDiv.parentNode.removeChild(overlayDiv);
      }
    };
  }, [updateCamera, doSel, applyDisclosure, ND, CO, extent, strongestOutbound, projectHoverCard]);

  /* ---- external highlight ---- */
  useEffect(() => {
    if (!highlightNodeId) return;
    const s = sceneRef.current;
    if (!s) return;
    const mesh = s.mm[highlightNodeId];
    if (mesh) doSel(mesh);
    onHighlightConsumed?.();
  }, [highlightNodeId, doSel, onHighlightConsumed]);

  /* Filter change handler kept for programmatic use (buttons moved to page HUD) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleFilter = useCallback(
    (id: string) => {
      setActiveFilters((prev) => {
        let next: Set<string>;
        if (id === "all") {
          next = new Set(["all"]);
        } else {
          next = new Set(prev);
          next.delete("all");
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          if (next.size === 0 || next.size === 4) {
            next = new Set(["all"]);
          }
        }
        applyFilter(next);
        return next;
      });
    },
    [applyFilter],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full" style={{ width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        className="block rounded-xl"
        style={{ cursor: "grab", width: "100%", height: "100%" }}
      />

      {/* hover card tooltip */}
      {hoverCard && (
        <div
          className="absolute z-20 w-72 rounded-xl border p-3 shadow-2xl"
          style={{
            left: Math.min(Math.max(hoverCard.x + 16, 8), (containerRef.current?.clientWidth || 680) - 300),
            top: Math.min(Math.max(hoverCard.y - 120, 8), (containerRef.current?.clientHeight || 560) - 180),
            pointerEvents: "none",
            background: "var(--color-background-primary, rgba(11,16,28,0.94))",
            borderColor: "var(--color-border-primary, rgba(148,163,184,0.28))",
            color: "var(--color-text-primary, #e2e8f0)",
          }}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-[13px] font-semibold">
            <span className="truncate">{hoverCard.filename}</span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] uppercase tracking-wide"
              style={{ background: "var(--color-background-secondary, rgba(30,41,59,0.65))", color: "var(--color-text-secondary, #cbd5e1)" }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: hoverCard.layerColor }} />
              {hoverCard.layer}
            </span>
          </div>
          <p className="mb-2 text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary, #9ca3af)" }}>
            {hoverCard.summary}
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5 text-[13px]">
            <span className="rounded-md px-2 py-0.5" style={{ background: "var(--color-background-secondary, rgba(30,41,59,0.65))" }}>fan-in: {hoverCard.fanIn}</span>
            <span className="rounded-md px-2 py-0.5" style={{ background: "var(--color-background-secondary, rgba(30,41,59,0.65))" }}>fan-out: {hoverCard.fanOut}</span>
            <span
              className="rounded-md px-2 py-0.5"
              style={{
                background: "var(--color-background-secondary, rgba(30,41,59,0.65))",
                color: hoverCard.risk > 60 ? "#ef4444" : hoverCard.risk > 30 ? "#f59e0b" : "#22c55e",
              }}
            >
              risk: {hoverCard.risk}
            </span>
            <span className="rounded-md px-2 py-0.5" style={{ background: "var(--color-background-secondary, rgba(30,41,59,0.65))" }}>LOC: {hoverCard.loc}</span>
          </div>
          <div className="text-[13px]" style={{ color: "var(--color-text-secondary, #9ca3af)" }}>
            Read next: <span style={{ color: "var(--color-text-primary, #e2e8f0)" }}>{hoverCard.readNext} &rarr;</span>
          </div>
        </div>
      )}

      {/* hint text */}
      <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-[#0a0e18]/70 px-2.5 py-1.5 text-[13px] text-white/40 backdrop-blur-sm">
        Drag to orbit · Ctrl+drag to pan · Ctrl+scroll to zoom · Click a node
      </div>

      {/* ── Legend ── */}
      <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-xl border border-white/8 bg-[#0a0e18]/85 px-3 py-2.5 backdrop-blur-sm">
        <div className="mb-2 text-[13px] font-semibold text-slate-400">Legend</div>
        {/* Node colors = risk */}
        <div className="mb-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#16a34a" }} />
            <span className="text-[13px] text-slate-400">Low risk (0–30)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#d97706" }} />
            <span className="text-[13px] text-slate-400">Medium risk (31–60)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#dc2626" }} />
            <span className="text-[13px] text-slate-400">High risk (61+)</span>
          </div>
        </div>
        {/* Markers */}
        <div className="mb-2 space-y-1 border-t border-white/6 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-sky-400">◯</span>
            <span className="text-[13px] text-slate-400">Entry point (ring)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-purple-400">●</span>
            <span className="text-[13px] text-slate-400">Security-sensitive</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-red-400">⚠</span>
            <span className="text-[13px] text-slate-400">Hotspot (high risk)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-cyan-400">⬟</span>
            <span className="text-[13px] text-slate-400">Entry point label</span>
          </div>
        </div>
        {/* Connections */}
        <div className="space-y-1 border-t border-white/6 pt-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "#7f77dd" }} />
            <span className="text-[13px] text-slate-400">Cross-layer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "#ef4444" }} />
            <span className="text-[13px] text-slate-400">Circular dep</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "#22d3ee" }} />
            <span className="text-[13px] text-slate-400">Fan-out (on hover)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "#f59e0b" }} />
            <span className="text-[13px] text-slate-400">Fan-in (on hover)</span>
          </div>
        </div>
      </div>

      {/* minimap */}
      <canvas
        ref={minimapRef}
        width={120}
        height={80}
        className="absolute bottom-3 right-3 z-20 rounded-lg border border-white/10 backdrop-blur-xl"
        style={{ width: 120, height: 80, cursor: "crosshair" }}
        onClick={(e) => {
          const s = sceneRef.current;
          if (!s) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const MW = 120;
          const MH = 80;
          const mapExtent = extent * 0.55;
          const scaleX = MW / (mapExtent * 2);
          const scaleZ = MH / (mapExtent * 2);
          const worldX = (mx - MW / 2) / scaleX;
          const worldZ = (my - MH / 2) / scaleZ;
          // Fly camera to the clicked position (keep Y the same)
          s.gtx = worldX;
          s.gtz = worldZ;
        }}
      />
    </div>
  );
}
