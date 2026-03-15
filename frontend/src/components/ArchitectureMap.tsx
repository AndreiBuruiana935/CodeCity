"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import * as THREE from "three";
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
  /* optional enrichment — only present for dynamic (city) data */
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
  // ── Database layer ──
  { id: "ctyp", lb: "Data Types",          l: "db",  x: -5,    z: -1.5 },
  { id: "nxtd", lb: "NextAuth Types",    l: "db",  x: -1.5,  z: -3   },
  { id: "lcst", lb: "LocalStorage",      l: "db",  x: 2.5,   z: 0    },
  { id: "bcch", lb: "LLM Cache",         l: "db",  x: 6,     z: -1.5 },

  // ── Backend / service layer ──
  { id: "cart", lb: "Cartographer",       l: "be",  x: -6,    z: 2    },
  { id: "insp", lb: "Inspector",          l: "be",  x: -3,    z: -2   },
  { id: "guid", lb: "Guide Agent",        l: "be",  x: 0,     z: 2.5  },
  { id: "anlz", lb: "Static Analyzer",    l: "be",  x: 3,     z: -1   },
  { id: "ctgn", lb: "Graph Generator",    l: "be",  x: -1,    z: -0.5 },
  { id: "ghub", lb: "GitHub Client",      l: "be",  x: 5.5,   z: 1    },
  { id: "aism", lb: "AI Summarizer",      l: "be",  x: 6.5,   z: -2.5 },
  { id: "auth", lb: "Auth Config",        l: "be",  x: -5.5,  z: -3   },

  // ── API layer ──
  { id: "aAnl", lb: "POST /api/analyze",          l: "api", x: -5,    z: 0    },
  { id: "aQst", lb: "POST /api/question",         l: "api", x: -2.5,  z: 2.5  },
  { id: "aSum", lb: "POST /api/summarize",         l: "api", x: 0.5,   z: -2   },
  { id: "aNxt", lb: "NextAuth Route",              l: "api", x: -6.5,  z: -2.5 },
  { id: "aCfg", lb: "GET /auth/config",            l: "api", x: -4,    z: -3.5 },
  { id: "aRep", lb: "GET /api/github/repos",       l: "api", x: 3,     z: 1.5  },
  { id: "aDet", lb: "GET /api/repo-details",       l: "api", x: 5.5,   z: -0.5 },
  { id: "bMap", lb: "POST /map-repository",        l: "api", x: -7,    z: 1.5  },
  { id: "bIns", lb: "POST /inspect-file",          l: "api", x: 2,     z: 3.5  },
  { id: "bGud", lb: "POST /chat-guide",            l: "api", x: 7,     z: 2    },
  { id: "bClr", lb: "POST /clear-cache",           l: "api", x: 6,     z: 3.5  },
  { id: "bHlt", lb: "GET / (health)",              l: "api", x: 7.5,   z: -2   },

  // ── Frontend layer ──
  { id: "pLnd", lb: "Landing Page",        l: "fe", x: -5.5,  z: -1   },
  { id: "pPrj", lb: "Projects Page",       l: "fe", x: -2,    z: 2    },
  { id: "pCty", lb: "Architecture Page",  l: "fe", x: 2,     z: 0    },
  { id: "cLay", lb: "Root Layout",         l: "fe", x: -7.5,  z: 0.5  },
  { id: "cCtx", lb: "AppContext",           l: "fe", x: -3.5,  z: -3   },
  { id: "cAPr", lb: "AuthProvider",         l: "fe", x: -7,    z: -2   },
  { id: "cSid", lb: "SidePanel",            l: "fe", x: 5,     z: -2   },
  { id: "cFTr", lb: "FileTree",             l: "fe", x: 5,     z: 1    },
  { id: "cGrp", lb: "RepoGraph",            l: "fe", x: 6.5,   z: -0.5 },
  { id: "cQBr", lb: "QuestionBar",          l: "fe", x: 7.5,   z: 2    },
  { id: "cOnb", lb: "OnboardingOverlay",    l: "fe", x: 3.5,   z: 3    },
  { id: "cTor", lb: "TourOverlay",          l: "fe", x: 1,     z: 3.5  },
];

const STATIC_CO_RAW: [string, string][] = [
  // Frontend → API
  ["pLnd", "aCfg"],
  ["cCtx", "aAnl"],
  ["cCtx", "aSum"],
  ["pPrj", "aRep"],
  ["pPrj", "aDet"],
  ["cQBr", "bGud"],

  // API → Services/Libs
  ["aAnl", "ghub"],
  ["aAnl", "ctgn"],
  ["aAnl", "aism"],
  ["aQst", "aism"],
  ["aNxt", "auth"],
  ["bMap", "cart"],
  ["bIns", "insp"],
  ["bGud", "guid"],
  ["bClr", "bcch"],

  // Lib → Lib
  ["ctgn", "anlz"],
  ["ctgn", "ghub"],

  // Service → Data
  ["aism", "ctyp"],
  ["anlz", "ctyp"],
  ["ctgn", "ctyp"],
  ["aQst", "ctyp"],
  ["cCtx", "ctyp"],
  ["cCtx", "lcst"],
  ["pLnd", "lcst"],
  ["cart", "bcch"],
  ["insp", "bcch"],

  // Component composition
  ["cLay", "cAPr"],
  ["cLay", "cCtx"],
  ["pCty", "cFTr"],
  ["pCty", "cGrp"],
  ["pCty", "cSid"],
  ["pCty", "cQBr"],
  ["pCty", "cOnb"],
  ["pCty", "cTor"],
  ["pLnd", "cCtx"],
  ["pPrj", "cCtx"],
  ["pCty", "cCtx"],

  // Components → types
  ["cSid", "ctyp"],
  ["cFTr", "ctyp"],
  ["cGrp", "ctyp"],
  ["cQBr", "ctyp"],
  ["cOnb", "ctyp"],
  ["cTor", "ctyp"],
];

const STATIC_CO: Conn[] = STATIC_CO_RAW.map(([a, b]) => ({ a, b, type: "import", weight: 1 }));

const CONNECTION_STYLE: Record<
  ConnType,
  { color: number; opacity: number; linewidth: number; dashed: boolean; dashSize?: number; gapSize?: number }
> = {
  "cross-layer": { color: 0x7f77dd, opacity: 0.34, linewidth: 2.5, dashed: false },
  circular: { color: 0xdc2626, opacity: 0.55, linewidth: 1.5, dashed: true, dashSize: 0.42, gapSize: 0.24 },
  "type-import": { color: 0x888780, opacity: 0.42, linewidth: 0.8, dashed: true, dashSize: 0.26, gapSize: 0.2 },
  import: { color: 0x3d7acc, opacity: 0.24, linewidth: 1.2, dashed: false },
};

/* ------------------------------------------------------------------ */
/*  DYNAMIC REPO → ARCHITECTURE DATA                                   */
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
 * The regex only runs when the Cartographer hasn't returned data.
 */
export function classifyLayer(
  path: string,
  role?: string,
  aiLayer?: string,
): "db" | "be" | "api" | "fe" {
  // 1. AI Cartographer assigned an explicit layer — trust it directly
  if (aiLayer && AI_LAYER_TO_SHORT[aiLayer]) {
    return AI_LAYER_TO_SHORT[aiLayer];
  }

  // 2. AI role available but no layer — map role → layer as best guess
  if (role) {
    switch (role) {
      case "model": case "migration": return "db";
      case "route": case "controller": case "middleware": return "api";
      case "service": case "utility": case "config": case "type": return "be";
      case "component": case "hook": case "entry": return "fe";
    }
  }

  // 3. No AI data at all — regex fallback (only used before Cartographer runs)
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

function cityToArchData(city: CitySchema): { ND: NodeDef[]; CO: Conn[]; extent: number } {
  const allBuildings = city.city.districts.flatMap((d) => d.buildings);
  const hotspotSet = new Set(city.city.hotspots ?? []);
  const entrySet = new Set(city.city.entryPoints ?? []);
  const coveredSet = new Set(city.city.testCoverage?.covered ?? []);
  const uncoveredSet = new Set(city.city.testCoverage?.uncovered ?? []);

  /* compute fan-in / fan-out from roads */
  const fanInMap: Record<string, number> = {};
  const fanOutMap: Record<string, number> = {};
  const pairSet = new Set<string>();
  for (const r of city.city.roads) {
    fanOutMap[r.from] = (fanOutMap[r.from] || 0) + (r.weight || 1);
    fanInMap[r.to] = (fanInMap[r.to] || 0) + (r.weight || 1);
    pairSet.add(`${r.from}::${r.to}`);
  }

  /* detect circular (bidirectional) dependencies */
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

  // position nodes per layer
  const byLayer: Record<string, NodeDef[]> = { db: [], be: [], api: [], fe: [] };
  ND.forEach((n) => byLayer[n.l].push(n));

  const MIN_SPACING = 2.8;
  let maxExtent = 22;

  for (const layerNodes of Object.values(byLayer)) {
    const count = layerNodes.length;
    if (!count) continue;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.5)));
    const spacing = MIN_SPACING;
    layerNodes.forEach((n, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const totalRows = Math.ceil(count / cols);
      n.x = (col - (cols - 1) / 2) * spacing;
      n.z = (row - (totalRows - 1) / 2) * (spacing * 0.85);
    });
    for (const n of layerNodes) {
      maxExtent = Math.max(maxExtent, Math.abs(n.x) * 2 + 6, Math.abs(n.z) * 2 + 6);
    }
  }

  const nodeIds = new Set(ND.map((n) => n.id));
  const CO: Conn[] = city.city.roads
    .filter((r) => nodeIds.has(r.from) && nodeIds.has(r.to) && r.from !== r.to)
    .map((r) => ({
      a: r.from,
      b: r.to,
      type: r.type,
      weight: r.weight || 1,
    }));

  return { ND, CO, extent: maxExtent };
}

/* ------------------------------------------------------------------ */
/*  LAYER CONFIG                                                       */
/* ------------------------------------------------------------------ */

export const LAYERS: Record<string, { y: number; c: number; name: string }> = {
  db:  { y: -7,   c: 0xba7517, name: "database" },
  be:  { y: -2.5, c: 0x1d9e75, name: "backend" },
  api: { y: 2.5,  c: 0x7f77dd, name: "api" },
  fe:  { y: 7,    c: 0xd85a30, name: "frontend" },
};

const LAYER_KEYS = ["db", "be", "api", "fe"] as const;
export const FILTER_BUTTONS = [
  { id: "all", label: "All" },
  { id: "db",  label: "Database" },
  { id: "be",  label: "Backend" },
  { id: "api", label: "API" },
  { id: "fe",  label: "Frontend" },
];

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  onSelect?: (sel: ArchSelection | null) => void;
  city?: CitySchema | null;
  highlightNodeId?: string | null;
  onHighlightConsumed?: () => void;
  controlledFilters?: Set<string>;
}

export default function ArchitectureMap({ onSelect, city, highlightNodeId, onHighlightConsumed, controlledFilters }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["all"]));
  const [selData, setSelData] = useState<{ lb: string; lname: string; cnt: number } | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [showFlowOverlay, setShowFlowOverlay] = useState(false);
  const [selectedConnType, setSelectedConnType] = useState<"all" | ConnType>("all");
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

  const flowOverlayRef = useRef<{
    tubes: THREE.Mesh[];
    tubeMaterials: THREE.MeshStandardMaterial[];
    tubeTextures: THREE.Texture[];
    tubeGeometries: THREE.BufferGeometry[];
    sprites: THREE.Sprite[];
    spriteMaterials: THREE.SpriteMaterial[];
    spriteTextures: THREE.Texture[];
  }>({
    tubes: [],
    tubeMaterials: [],
    tubeTextures: [],
    tubeGeometries: [],
    sprites: [],
    spriteMaterials: [],
    spriteTextures: [],
  });

  /* refs for mutable scene state (avoid re-renders inside rAF loop) */
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    cam: THREE.PerspectiveCamera;
    mm: Record<string, THREE.Mesh>;
    ml: THREE.Mesh[];
    ll: THREE.Line[];
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
  } | null>(null);

  const selDataRef = useRef(selData);
  selDataRef.current = selData;

  const filterRef = useRef(activeFilters);
  filterRef.current = activeFilters;

  const selectedConnTypeRef = useRef<"all" | ConnType>("all");
  selectedConnTypeRef.current = selectedConnType;

  /* ---- updateCamera helper ---- */
  const updateCamera = useCallback((s: NonNullable<typeof sceneRef.current>) => {
    s.cam.position.set(
      s.tx + s.rr * Math.sin(s.ph) * Math.sin(s.th),
      s.ty + s.rr * Math.cos(s.ph),
      s.tz + s.rr * Math.sin(s.ph) * Math.cos(s.th),
    );
    s.cam.lookAt(s.tx, s.ty, s.tz);
  }, []);

  /* ---- graph emphasis based on selected node + connection type ---- */
  const applyGraphEmphasis = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;

    const connType = selectedConnTypeRef.current;
    const selectedMesh = s.sel;

    if (selectedMesh) {
      const ud = selectedMesh.userData as { id: string };
      const adjacentIds = new Set<string>();

      s.ll.forEach((line) => {
        const ld = line.userData as { a: string; b: string; type: ConnType; baseColor: number };
        const connectedToSelected = ld.a === ud.id || ld.b === ud.id;
        const typeMatches = connType === "all" || ld.type === connType;
        const on = connectedToSelected && typeMatches;
        if (on) {
          adjacentIds.add(ld.a === ud.id ? ld.b : ld.a);
        }
        const mat = line.material as THREE.LineBasicMaterial | THREE.LineDashedMaterial;
        mat.opacity = on ? 0.92 : 0.05;
        mat.color.setHex(ld.baseColor);
      });

      s.ml.forEach((n) => {
        const nud = n.userData as { id: string };
        const isSel = n === selectedMesh;
        const isAdj = adjacentIds.has(nud.id);
        const op = isSel || isAdj ? 1 : 0.16;
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const mt of mats) (mt as THREE.MeshStandardMaterial).opacity = op;
      });

      return;
    }

    if (connType === "all") {
      s.ll.forEach((line) => {
        const ld = line.userData as { baseColor: number; baseOpacity: number };
        const mat = line.material as THREE.LineBasicMaterial | THREE.LineDashedMaterial;
        mat.opacity = ld.baseOpacity;
        mat.color.setHex(ld.baseColor);
      });
      s.ml.forEach((n) => {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const mt of mats) (mt as THREE.MeshStandardMaterial).opacity = 0.88;
      });
      return;
    }

    const highlightedNodeIds = new Set<string>();
    coRef.current.forEach((c) => {
      if (c.type === connType) {
        highlightedNodeIds.add(c.a);
        highlightedNodeIds.add(c.b);
      }
    });

    s.ll.forEach((line) => {
      const ld = line.userData as { type: ConnType; baseColor: number };
      const on = ld.type === connType;
      const mat = line.material as THREE.LineBasicMaterial | THREE.LineDashedMaterial;
      mat.opacity = on ? 0.92 : 0.06;
      mat.color.setHex(ld.baseColor);
    });

    s.ml.forEach((n) => {
      const nud = n.userData as { id: string };
      const op = highlightedNodeIds.has(nud.id) ? 0.95 : 0.14;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const mt of mats) (mt as THREE.MeshStandardMaterial).opacity = op;
    });
  }, []);

  /* ---- selection logic ---- */
  const doSel = useCallback((mesh: THREE.Mesh | null) => {
    const s = sceneRef.current;
    if (!s) return;
    s.sel = mesh;

    if (mesh) {
      const ud = mesh.userData as { id: string; lb: string; lname: string };
      const connPairs = coRef.current.filter((c) => c.a === ud.id || c.b === ud.id);
      const cnt = connPairs.length;
      setSelData({ lb: ud.lb, lname: ud.lname, cnt });

      // Build connected node labels
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

      applyGraphEmphasis();

      /* animate camera toward selected node */
      s.gtx = mesh.position.x;
      s.gty = mesh.position.y;
      s.gtz = mesh.position.z;
      s.grr = Math.min(s.rr, 18);
    } else {
      setSelData(null);
      onSelectRef.current?.(null);
      applyGraphEmphasis();

      /* keep current view on deselect */
      s.gtx = s.tx;
      s.gty = s.ty;
      s.gtz = s.tz;
    }
  }, [applyGraphEmphasis]);

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

  const clearFlowOverlay = useCallback((scene?: THREE.Scene) => {
    const f = flowOverlayRef.current;
    if (scene) {
      f.tubes.forEach((mesh) => scene.remove(mesh));
      f.sprites.forEach((sprite) => scene.remove(sprite));
    }
    f.tubeGeometries.forEach((g) => g.dispose());
    f.tubeMaterials.forEach((m) => m.dispose());
    f.tubeTextures.forEach((t) => t.dispose());
    f.spriteMaterials.forEach((m) => m.dispose());
    f.spriteTextures.forEach((t) => t.dispose());
    f.tubes = [];
    f.tubeMaterials = [];
    f.tubeTextures = [];
    f.tubeGeometries = [];
    f.sprites = [];
    f.spriteMaterials = [];
    f.spriteTextures = [];
  }, []);

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
    const overlay = overlayRef.current;
    const container = containerRef.current;
    if (!canvas || !overlay || !container) return;

    const W = container.clientWidth || 680;
    const H = 560;
    canvas.style.height = H + "px";
    overlay.style.height = H + "px";

    /* renderer */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x080c14);

    /* scene + camera */
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(52, W / H, 0.1, Math.max(500, extent * 4));

    /* dynamic grid extent based on node layout */
    const gridExtent = extent;
    const gridDivisions = Math.max(11, Math.round(gridExtent / 2));

    /* lights */
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(10, 16, 8);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0x4466ff, 0.3);
    dl2.position.set(-8, -4, -6);
    scene.add(dl2);

    /* layer planes + grids */
    Object.values(LAYERS).forEach((l) => {
      const g = new THREE.GridHelper(gridExtent, gridDivisions, l.c, l.c);
      (g.material as THREE.Material).opacity = 0.08;
      (g.material as THREE.Material).transparent = true;
      g.position.y = l.y;
      scene.add(g);

      const pg = new THREE.PlaneGeometry(gridExtent, gridExtent);
      const pm = new THREE.MeshBasicMaterial({
        color: l.c,
        transparent: true,
        opacity: 0.025,
        side: THREE.DoubleSide,
      });
      const pp = new THREE.Mesh(pg, pm);
      pp.rotation.x = -Math.PI / 2;
      pp.position.y = l.y;
      scene.add(pp);
    });

    /* helper: create a canvas texture with text for a block face */
    function makeTextTexture(
      text: string,
      faceW: number,
      faceH: number,
      hexColor: number,
      risk?: number,
      loc?: number,
    ): THREE.CanvasTexture {
      const baseRes = 256;
      const aspect = Math.max(faceW, 0.1) / Math.max(faceH, 0.1);
      const cW = Math.round(baseRes * Math.max(1, aspect));
      const cH = Math.round(baseRes / Math.min(1, aspect));
      const cvs = document.createElement("canvas");
      cvs.width = cW;
      cvs.height = cH;
      const ctx = cvs.getContext("2d")!;
      const r = (hexColor >> 16) & 0xff;
      const g = (hexColor >> 8) & 0xff;
      const b = hexColor & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, cW, cH);
      // subtle border
      ctx.strokeStyle = `rgba(255,255,255,0.15)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, cW - 4, cH - 4);
      // text
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      let fontSize = Math.floor(Math.min(cH * 0.32, cW * 0.18));
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      while (ctx.measureText(text).width > cW * 0.88 && fontSize > 10) {
        fontSize--;
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      }
      const mainY = cH * 0.52;
      ctx.fillText(text, cW / 2, mainY);

      const subText = `risk: ${Math.round(risk || 0)} | LOC: ${Math.round(loc || 0)}`;
      const subSize = Math.max(10, Math.floor(fontSize * 0.6));
      ctx.font = `500 ${subSize}px Arial, sans-serif`;
      ctx.fillStyle = "rgba(225, 232, 255, 0.82)";
      ctx.fillText(subText, cW / 2, mainY + subSize + 4);
      const tex = new THREE.CanvasTexture(cvs);
      tex.needsUpdate = true;
      return tex;
    }

    /* nodes */
    const mm: Record<string, THREE.Mesh> = {};
    const ml: THREE.Mesh[] = [];
    const markerMeshes: THREE.Mesh[] = [];
    const markerMaterials: THREE.Material[] = [];
    const markerGeometries: THREE.BufferGeometry[] = [];
    const entryRingMaterials: THREE.MeshBasicMaterial[] = [];

    ND.forEach((n) => {
      const ly = LAYERS[n.l];
      const h = n.loc ? Math.max(0.2, Math.min(3.5, Math.sqrt(n.loc) * 0.08)) : 0.3;

      /* risk-based color: blend layer color toward red/yellow for high risk */
      let nodeColor = ly.c;
      let emissiveColor = 0x000000;
      let emissiveIntensity = 0;
      if (n.risk !== undefined) {
        if (n.risk > 60) {
          nodeColor = 0xdc2626; // red
          emissiveColor = 0xff2222;
          emissiveIntensity = 0.15;
        } else if (n.risk > 30) {
          nodeColor = 0xd97706; // amber
          emissiveColor = 0xffaa00;
          emissiveIntensity = 0.08;
        } else {
          nodeColor = 0x16a34a; // green
        }
      }
      /* hotspot: extra glow */
      if (n.hotspot) {
        emissiveColor = 0xff4444;
        emissiveIntensity = 0.35;
      }

      const w = Math.min(1.05 + (n.fanIn || 0) * 0.08, 2.2);
      const d = n.hotspot ? 0.82 : 0.62;

      /* create text textures for each face orientation */
      const texFB = makeTextTexture(n.lb, w, h, nodeColor, n.risk, n.loc); // front & back (w × h)
      const texLR = makeTextTexture(n.lb, d, h, nodeColor, n.risk, n.loc); // left & right (d × h)
      const texTB = makeTextTexture(n.lb, w, d, nodeColor, n.risk, n.loc); // top & bottom (w × d)

      const matProps = {
        emissive: emissiveColor,
        emissiveIntensity,
        metalness: 0.15,
        roughness: 0.6,
        transparent: true,
        opacity: 0.88,
      };
      /* 6 materials: +X, -X, +Y, -Y, +Z, -Z */
      const materials = [
        new THREE.MeshStandardMaterial({ map: texLR, ...matProps }),
        new THREE.MeshStandardMaterial({ map: texLR, ...matProps }),
        new THREE.MeshStandardMaterial({ map: texTB, ...matProps }),
        new THREE.MeshStandardMaterial({ map: texTB, ...matProps }),
        new THREE.MeshStandardMaterial({ map: texFB, ...matProps }),
        new THREE.MeshStandardMaterial({ map: texFB, ...matProps }),
      ];

      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, materials);
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

    /* connections */
    const ll: THREE.Line[] = [];
    const cr: { curve: THREE.QuadraticBezierCurve3; a: string; b: string; type: ConnType; weight: number }[] = [];

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
      const pts = curve.getPoints(30);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const style = CONNECTION_STYLE[type] || CONNECTION_STYLE.import;
      const mat = style.dashed
        ? new THREE.LineDashedMaterial({
            color: style.color,
            transparent: true,
            opacity: style.opacity,
            linewidth: style.linewidth,
            dashSize: style.dashSize,
            gapSize: style.gapSize,
          })
        : new THREE.LineBasicMaterial({
            color: style.color,
            transparent: true,
            opacity: style.opacity,
            linewidth: style.linewidth,
          });
      const line = new THREE.Line(geo, mat);
      if (style.dashed) line.computeLineDistances();
      line.userData = { a, b, type, weight, baseColor: style.color, baseOpacity: style.opacity };
      scene.add(line);
      ll.push(line);
    });

    /* animated particles — share geometry + material per layer */
    const pts2: { m: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; s: number }[] = [];
    const particleGeo = new THREE.SphereGeometry(0.07, 5, 5);
    const particleMatCache: Record<number, THREE.MeshBasicMaterial> = {};
    cr.forEach(({ curve, b: bId }) => {
      const tly = LAYERS[ND.find((n) => n.id === bId)?.l || "api"];
      const col = tly?.c || 0x4af0d0;
      if (!particleMatCache[col]) particleMatCache[col] = new THREE.MeshBasicMaterial({ color: col });
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(particleGeo, particleMatCache[col]);
        scene.add(m);
        pts2.push({ m, curve, t: Math.random(), s: 0.11 + Math.random() * 0.1 });
      }
    });

    /* layer name labels — placed at a far corner of each layer plane */
    const layerLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
    for (const [key, ly] of Object.entries(LAYERS)) {
      const el = document.createElement("div");
      el.className = "arch-layer-label";
      el.textContent = ly.name.toUpperCase();
      el.style.color = `#${ly.c.toString(16).padStart(6, "0")}`;
      overlay.appendChild(el);
      /* position at negative-x, negative-z corner of the grid */
      const cornerOffset = gridExtent * 0.46;
      layerLabels.push({ el, pos: new THREE.Vector3(-cornerOffset, ly.y, -cornerOffset) });
    }

    /* state object */
    const initialRr = Math.max(26, gridExtent * 1.1);
    const s = {
      renderer,
      scene,
      cam,
      mm,
      ml,
      ll,
      cr,
      pts: pts2,
      layerLabels,
      ph: 0.88,
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
      hov: null as THREE.Mesh | null,
      sel: null as THREE.Mesh | null,
      filter: "all",
      lt: 0,
      W,
      H,
      animId: 0,
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
          /* panning */
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
          }
          canvas!.style.cursor = s.hov ? "pointer" : "grab";
        } else if (s.hov) {
          s.hov = null;
          projectHoverCard(null);
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
      s.rr = Math.max(8, Math.min(150, s.rr + e.deltaY * 0.07));
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
    function onResize() {
      s.W = container?.clientWidth || 680;
      renderer.setSize(s.W, s.H);
      cam.aspect = s.W / s.H;
      cam.updateProjectionMatrix();
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
    window.addEventListener("resize", onResize);

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

      /* animate flow tubes */
      flowOverlayRef.current.tubeTextures.forEach((tex, idx) => {
        tex.offset.x = (tex.offset.x - dt * (0.8 + idx * 0.03)) % 1;
      });

      /* layer name labels — projected onto 2D overlay */
      const cw = canvas!.clientWidth || s.W;
      s.layerLabels.forEach(({ el, pos }) => {
        tv.copy(pos).project(cam);
        if (tv.z > 1) { el.style.display = "none"; return; }
        el.style.display = "";
        el.style.left = (tv.x * 0.5 + 0.5) * cw + "px";
        el.style.top = (-tv.y * 0.5 + 0.5) * s.H + "px";
      });

      renderer.render(scene, cam);
    }

    s.animId = requestAnimationFrame(loop);

    /* cleanup */
    return () => {
      cancelAnimationFrame(s.animId);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", onResize);
      // Dispose all THREE.js resources to prevent GPU memory leaks
      s.ml.forEach((m: THREE.Mesh) => {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat: THREE.Material & { map?: THREE.Texture }) => {
          mat.map?.dispose();
          mat.dispose();
        });
      });
      s.ll.forEach((l: THREE.Line) => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      });
      markerMeshes.forEach((m) => {
        s.scene.remove(m);
      });
      markerGeometries.forEach((g) => g.dispose());
      markerMaterials.forEach((m) => m.dispose());
      s.pts.forEach((p: { m: THREE.Mesh }) => {
        // shared geo/mat — only dispose once below
      });
      particleGeo.dispose();
      Object.values(particleMatCache).forEach(m => m.dispose());
      clearFlowOverlay(s.scene);
      setHoverCard(null);
      renderer.dispose();
      overlay.innerHTML = "";
    };
  }, [updateCamera, doSel, ND, CO, extent, strongestOutbound, projectHoverCard, clearFlowOverlay]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    clearFlowOverlay(s.scene);
    if (!showFlowOverlay) return;

    const makeFlowTexture = (): THREE.CanvasTexture => {
      const cvs = document.createElement("canvas");
      cvs.width = 256;
      cvs.height = 16;
      const ctx = cvs.getContext("2d");
      if (!ctx) return new THREE.CanvasTexture(cvs);
      ctx.fillStyle = "rgba(34,211,238,0.06)";
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      for (let x = 0; x < cvs.width; x += 24) {
        ctx.fillStyle = "rgba(225,255,255,0.95)";
        ctx.fillRect(x, 0, 10, cvs.height);
      }
      const tex = new THREE.CanvasTexture(cvs);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 1);
      tex.needsUpdate = true;
      return tex;
    };

    const makeStepSprite = (step: number): { texture: THREE.CanvasTexture; material: THREE.SpriteMaterial } => {
      const cvs = document.createElement("canvas");
      cvs.width = 96;
      cvs.height = 96;
      const ctx = cvs.getContext("2d");
      if (!ctx) {
        const texture = new THREE.CanvasTexture(cvs);
        return { texture, material: new THREE.SpriteMaterial({ map: texture }) };
      }
      ctx.beginPath();
      ctx.arc(48, 48, 40, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34,211,238,0.92)";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.78)";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 42px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(step), 48, 50);
      const texture = new THREE.CanvasTexture(cvs);
      texture.needsUpdate = true;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      return { texture, material };
    };

    const outbound = new Map<string, Conn[]>();
    CO.forEach((conn) => {
      const curr = outbound.get(conn.a) || [];
      curr.push(conn);
      outbound.set(conn.a, curr);
    });
    outbound.forEach((edges) => edges.sort((x, y) => y.weight - x.weight));

    const curveByEdge = new Map<string, THREE.QuadraticBezierCurve3>();
    s.cr.forEach((entry) => {
      curveByEdge.set(`${entry.a}->${entry.b}`, entry.curve);
    });

    ND.filter((n) => n.entryPoint).forEach((entryNode) => {
      const visited = new Set<string>([entryNode.id]);
      const pathNodes: string[] = [entryNode.id];
      const pathEdges: Conn[] = [];
      let current = entryNode.id;

      for (let hops = 0; hops < 8; hops++) {
        const nextEdge = (outbound.get(current) || []).find((e) => !visited.has(e.b));
        if (!nextEdge) break;
        pathEdges.push(nextEdge);
        current = nextEdge.b;
        visited.add(current);
        pathNodes.push(current);
      }

      pathEdges.forEach((edge, idx) => {
        const curve = curveByEdge.get(`${edge.a}->${edge.b}`);
        if (!curve) return;
        const tubeGeo = new THREE.TubeGeometry(curve, 38, 0.06, 8, false);
        const flowTex = makeFlowTexture();
        const mat = new THREE.MeshStandardMaterial({
          color: 0x22d3ee,
          emissive: 0x22d3ee,
          emissiveIntensity: 0.85,
          transparent: true,
          opacity: 0.88,
          map: flowTex,
        });
        const tube = new THREE.Mesh(tubeGeo, mat);
        tube.userData = { flow: true, index: idx };
        s.scene.add(tube);
        flowOverlayRef.current.tubes.push(tube);
        flowOverlayRef.current.tubeGeometries.push(tubeGeo);
        flowOverlayRef.current.tubeMaterials.push(mat);
        flowOverlayRef.current.tubeTextures.push(flowTex);
      });

      pathNodes.forEach((nodeId, idx) => {
        const mesh = s.mm[nodeId];
        if (!mesh) return;
        const { texture, material } = makeStepSprite(idx + 1);
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(mesh.position).add(new THREE.Vector3(0, 0.85, 0));
        sprite.scale.set(0.75, 0.75, 0.75);
        s.scene.add(sprite);
        flowOverlayRef.current.sprites.push(sprite);
        flowOverlayRef.current.spriteMaterials.push(material);
        flowOverlayRef.current.spriteTextures.push(texture);
      });
    });

    return () => {
      clearFlowOverlay(s.scene);
    };
  }, [showFlowOverlay, ND, CO, clearFlowOverlay]);

  /* ---- external highlight ---- */
  useEffect(() => {
    if (!highlightNodeId) return;
    const s = sceneRef.current;
    if (!s) return;
    const mesh = s.mm[highlightNodeId];
    if (mesh) doSel(mesh);
    onHighlightConsumed?.();
  }, [highlightNodeId, doSel, onHighlightConsumed]);

  useEffect(() => {
    applyGraphEmphasis();
  }, [selectedConnType, applyGraphEmphasis]);

  /* ---- filter change handler ---- */
  const handleFilter = useCallback(
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
          // If nothing selected or all 4 selected, reset to "all"
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

  /* ---- Ask AI ---- */
  /* (moved to architecture page side panel) */

  /* ---- count per layer ---- */
  const counts = {
    db: ND.filter((n) => n.l === "db").length,
    be: ND.filter((n) => n.l === "be").length,
    api: ND.filter((n) => n.l === "api").length,
    fe: ND.filter((n) => n.l === "fe").length,
  };

  const isControlled = !!controlledFilters;

  /* summary counts for the enriched legend */
  const hotspotCount = ND.filter(n => n.hotspot).length;
  const entryCount = ND.filter(n => n.entryPoint).length;
  const securityCount = ND.filter(n => n.security).length;
  const circularCount = ND.filter(n => n.circular).length;
  const highRiskCount = ND.filter(n => (n.risk ?? 0) > 60).length;
  const hasEnrichment = ND.some(n => n.risk !== undefined);
  const connCounts = {
    import: CO.filter((c) => c.type === "import").length,
    crossLayer: CO.filter((c) => c.type === "cross-layer").length,
    circular: CO.filter((c) => c.type === "circular").length,
    typeImport: CO.filter((c) => c.type === "type-import").length,
  };

  return (
    <div className="w-full">
      {/* filter buttons — hidden when controlled externally */}
      {!isControlled && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
          <span className="mr-1 text-[11px] text-slate-400">Layer:</span>
          {FILTER_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleFilter(btn.id)}
              className={`rounded-full border px-3.5 py-1 text-[11px] font-medium transition ${
                activeFilters.has(btn.id)
                  ? "border-cyan-300/60 bg-white text-slate-950 shadow-[0_0_10px_rgba(103,232,249,0.2)]"
                  : "border-slate-600/50 bg-transparent text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {btn.label}
            </button>
          ))}
          <button
            onClick={() => setShowFlowOverlay((v) => !v)}
            className={`rounded-full border px-3.5 py-1 text-[11px] font-medium transition ${
              showFlowOverlay
                ? "border-cyan-300/60 bg-cyan-100 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.25)]"
                : "border-slate-600/50 bg-transparent text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            Flow path
          </button>
        </div>
      )}

      {/* 3D container */}
      <div ref={containerRef} className="relative w-full" style={{ height: 560 }}>
        <canvas
          ref={canvasRef}
          className="block rounded-xl"
          style={{ cursor: "grab", width: "100%", height: 560 }}
        />
        <div
          ref={overlayRef}
          className="pointer-events-none absolute left-0 top-0 w-full overflow-hidden"
          style={{ height: 560 }}
        >
          {hoverCard && (
            <div
              className="absolute z-20 w-72 rounded-xl border p-3 shadow-2xl"
              style={{
                left: Math.min(Math.max(hoverCard.x + 16, 8), (containerRef.current?.clientWidth || 680) - 300),
                top: Math.min(Math.max(hoverCard.y - 120, 8), 560 - 180),
                pointerEvents: "none",
                background: "var(--color-background-primary, rgba(11,16,28,0.94))",
                borderColor: "var(--color-border-primary, rgba(148,163,184,0.28))",
                color: "var(--color-text-primary, #e2e8f0)",
              }}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
                <span className="truncate">{hoverCard.filename}</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                  style={{ background: "var(--color-background-secondary, rgba(30,41,59,0.65))", color: "var(--color-text-secondary, #cbd5e1)" }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: hoverCard.layerColor }} />
                  {hoverCard.layer}
                </span>
              </div>
              <p className="mb-2 text-[11px] leading-relaxed" style={{ color: "var(--color-text-secondary, #9ca3af)" }}>
                {hoverCard.summary}
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
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
              <div className="text-[11px]" style={{ color: "var(--color-text-secondary, #9ca3af)" }}>
                Read next: <span style={{ color: "var(--color-text-primary, #e2e8f0)" }}>{hoverCard.readNext} →</span>
              </div>
            </div>
          )}
        </div>

        {/* hint text */}
        <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-[#0a0e18]/70 px-2.5 py-1.5 text-[10px] text-white/40 backdrop-blur-sm">
          Drag to orbit · Ctrl+drag to pan · Ctrl+scroll to zoom · Click a node
        </div>

        {/* comprehensive collapsible legend */}
        <div className="absolute top-3 right-3 z-10" style={{ maxHeight: 520, overflowY: "auto" }}>
          <button
            onClick={() => setLegendOpen(v => !v)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a0e18]/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-300 backdrop-blur-sm transition hover:border-white/20 hover:text-white"
          >
            <svg className={`h-3 w-3 transition-transform ${legendOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            Legend
          </button>
          {legendOpen && (
            <div className="pointer-events-auto mt-1 rounded-lg border border-white/10 bg-[#0a0e18]/90 px-3 py-2.5 backdrop-blur-sm">
              {/* Risk colors — only when enrichment present */}
              {hasEnrichment && (
                <div className="mb-2.5 border-t border-white/5 pt-2">
                  <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-500">Risk Level (color)</div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#16a34a" }} />
                    <span className="text-[10px] text-slate-300">Low risk (0–30)</span>
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#d97706" }} />
                    <span className="text-[10px] text-slate-300">Medium risk (31–60)</span>
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#dc2626" }} />
                    <span className="text-[10px] text-slate-300">High risk (61+)</span>
                    {highRiskCount > 0 && <span className="text-[9px] text-red-400">{highRiskCount}</span>}
                  </div>
                </div>
              )}

              {/* Markers */}
              {hasEnrichment && (
                <div className="mb-2.5 border-t border-white/5 pt-2">
                  <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-500">Markers</div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-2 w-4 rounded-sm" style={{ background: "#ff4444", boxShadow: "0 0 6px #ff4444" }} />
                    <span className="text-[10px] text-slate-300">Hotspot (top risk)</span>
                    {hotspotCount > 0 && <span className="text-[9px] text-red-400">{hotspotCount}</span>}
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-2 w-2 rounded-full border border-sky-400" style={{ background: "transparent" }} />
                    <span className="text-[10px] text-slate-300">Entry point</span>
                    {entryCount > 0 && <span className="text-[9px] text-sky-400">{entryCount}</span>}
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#c084fc" }} />
                    <span className="text-[10px] text-slate-300">Security-sensitive</span>
                    {securityCount > 0 && <span className="text-[9px] text-purple-400">{securityCount}</span>}
                  </div>
                </div>
              )}

              {/* Connections */}
              {hasEnrichment && (
                <div className="border-t border-white/5 pt-2">
                  <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-500">Connections</div>
                  <button
                    type="button"
                    onClick={() => setSelectedConnType("all")}
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left transition ${
                      selectedConnType === "all" ? "bg-cyan-400/15 text-cyan-200" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="inline-block h-2 w-2 rounded-full border border-slate-400/60" />
                    <span className="text-[10px]">All ({CO.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedConnType("import")}
                    className={`mt-0.5 flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left transition ${
                      selectedConnType === "import" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="inline-block h-0.5 w-4" style={{ background: "#3d7acc" }} />
                    <span className="text-[10px]">Import ({connCounts.import})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedConnType("cross-layer")}
                    className={`mt-0.5 flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left transition ${
                      selectedConnType === "cross-layer" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="inline-block h-0.5 w-4" style={{ background: "#7f77dd" }} />
                    <span className="text-[10px]">Cross-layer ({connCounts.crossLayer})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedConnType("circular")}
                    className={`mt-0.5 flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left transition ${
                      selectedConnType === "circular" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className="inline-block h-0.5 w-4"
                      style={{
                        background: "repeating-linear-gradient(90deg, #dc2626 0 6px, transparent 6px 10px)",
                      }}
                    />
                    <span className="text-[10px]">Circular ({connCounts.circular})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedConnType("type-import")}
                    className={`mt-0.5 flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left transition ${
                      selectedConnType === "type-import" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className="inline-block h-0.5 w-4"
                      style={{
                        background: "repeating-linear-gradient(90deg, #888780 0 5px, transparent 5px 9px)",
                      }}
                    />
                    <span className="text-[10px]">Type import ({connCounts.typeImport})</span>
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* legend */}
      {!isControlled && (
      <div className="mt-2.5 flex flex-wrap items-center gap-3.5 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#BA7517" }} />
          Database ({counts.db})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#1D9E75" }} />
          Backend ({counts.be})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#7F77DD" }} />
          API ({counts.api})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#D85A30" }} />
          Frontend ({counts.fe})
        </span>
        <span className="ml-auto text-[11px] opacity-50">
          {ND.length} nodes · {CO.length} connections
        </span>
      </div>
      )}
    </div>
  );
}
