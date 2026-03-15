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
}

type Conn = [string, string];

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

const STATIC_CO: Conn[] = [
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

  /* compute fan-in / fan-out from roads */
  const fanInMap: Record<string, number> = {};
  const fanOutMap: Record<string, number> = {};
  const pairSet = new Set<string>();
  for (const r of city.city.roads) {
    fanOutMap[r.from] = (fanOutMap[r.from] || 0) + 1;
    fanInMap[r.to] = (fanInMap[r.to] || 0) + 1;
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
    .map((r) => [r.from, r.to]);

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

  /* refs for mutable scene state (avoid re-renders inside rAF loop) */
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    cam: THREE.PerspectiveCamera;
    mm: Record<string, THREE.Mesh>;
    ml: THREE.Mesh[];
    ll: THREE.Line[];
    cr: { curve: THREE.QuadraticBezierCurve3; a: string; b: string }[];
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

  /* ---- updateCamera helper ---- */
  const updateCamera = useCallback((s: NonNullable<typeof sceneRef.current>) => {
    s.cam.position.set(
      s.tx + s.rr * Math.sin(s.ph) * Math.sin(s.th),
      s.ty + s.rr * Math.cos(s.ph),
      s.tz + s.rr * Math.sin(s.ph) * Math.cos(s.th),
    );
    s.cam.lookAt(s.tx, s.ty, s.tz);
  }, []);

  /* ---- selection logic ---- */
  const doSel = useCallback((mesh: THREE.Mesh | null) => {
    const s = sceneRef.current;
    if (!s) return;
    s.sel = mesh;

    if (mesh) {
      const ud = mesh.userData as { id: string; lb: string; lname: string };
      const connPairs = coRef.current.filter(([a, b]) => a === ud.id || b === ud.id);
      const cnt = connPairs.length;
      setSelData({ lb: ud.lb, lname: ud.lname, cnt });

      // Build connected node labels
      const connectedIds = connPairs.map(([a, b]) => (a === ud.id ? b : a));
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

      s.ll.forEach((line) => {
        const ld = line.userData as { a: string; b: string };
        const on = ld.a === ud.id || ld.b === ud.id;
        (line.material as THREE.LineBasicMaterial).opacity = on ? 0.92 : 0.04;
        (line.material as THREE.LineBasicMaterial).color.setHex(on ? 0x4af0d0 : 0x3d7acc);
      });

      s.ml.forEach((n) => {
        const nud = n.userData as { id: string };
        const isSel = n === mesh;
        const isAdj = coRef.current.some(
          ([a, b]) =>
            (a === ud.id && b === nud.id) || (b === ud.id && a === nud.id),
        );
        const op = isSel || isAdj ? 1 : 0.16;
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const mt of mats) (mt as THREE.MeshStandardMaterial).opacity = op;
      });

      /* animate camera toward selected node */
      s.gtx = mesh.position.x;
      s.gty = mesh.position.y;
      s.gtz = mesh.position.z;
      s.grr = Math.min(s.rr, 18);
    } else {
      setSelData(null);
      onSelectRef.current?.(null);
      s.ll.forEach((line) => {
        (line.material as THREE.LineBasicMaterial).opacity = 0.22;
        (line.material as THREE.LineBasicMaterial).color.setHex(0x3d7acc);
      });
      s.ml.forEach((n) => {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const mt of mats) (mt as THREE.MeshStandardMaterial).opacity = 0.88;
      });

      /* keep current view on deselect */
      s.gtx = s.tx;
      s.gty = s.ty;
      s.gtz = s.tz;
    }
  }, []);

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
    function makeTextTexture(text: string, faceW: number, faceH: number, hexColor: number): THREE.CanvasTexture {
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
      ctx.textBaseline = "middle";
      let fontSize = Math.floor(Math.min(cH * 0.32, cW * 0.18));
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      while (ctx.measureText(text).width > cW * 0.88 && fontSize > 10) {
        fontSize--;
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      }
      ctx.fillText(text, cW / 2, cH / 2);
      const tex = new THREE.CanvasTexture(cvs);
      tex.needsUpdate = true;
      return tex;
    }

    /* nodes */
    const mm: Record<string, THREE.Mesh> = {};
    const ml: THREE.Mesh[] = [];

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

      const w = n.hotspot ? 1.35 : 1.05;
      const d = n.hotspot ? 0.82 : 0.62;

      /* create text textures for each face orientation */
      const texFB = makeTextTexture(n.lb, w, h, nodeColor); // front & back (w × h)
      const texLR = makeTextTexture(n.lb, d, h, nodeColor); // left & right (d × h)
      const texTB = makeTextTexture(n.lb, w, d, nodeColor); // top & bottom (w × d)

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
      m.userData = { id: n.id, lb: n.lb, l: n.l, lname: ly.name, risk: n.risk, hotspot: n.hotspot, entryPoint: n.entryPoint, security: n.security, circular: n.circular, orphan: n.orphan };
      scene.add(m);
      mm[n.id] = m;
      ml.push(m);

      /* entry point ring marker */
      if (n.entryPoint) {
        const ringGeo = new THREE.RingGeometry(0.7, 0.85, 16);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(n.x, ly.y + h + 0.08, n.z);
        scene.add(ring);
      }

      /* security shield marker */
      if (n.security) {
        const shieldGeo = new THREE.SphereGeometry(0.15, 6, 6);
        const shieldMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(n.x + w / 2 + 0.2, ly.y + h, n.z);
        scene.add(shield);
      }
    });

    /* connections */
    const ll: THREE.Line[] = [];
    const cr: { curve: THREE.QuadraticBezierCurve3; a: string; b: string }[] = [];

    CO.forEach(([a, b], i) => {
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
      cr.push({ curve, a, b });
      const pts = curve.getPoints(30);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      /* circular deps get red line, others default blue */
      const isCircular = CO.some(([ca, cb]) => ca === b && cb === a);
      const mat = new THREE.LineBasicMaterial({
        color: isCircular ? 0xff4444 : 0x3d7acc,
        transparent: true,
        opacity: isCircular ? 0.45 : 0.22,
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { a, b, circular: isCircular };
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
          s.hov = pick(uv);
          canvas!.style.cursor = s.hov ? "pointer" : "grab";
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
      s.pts.forEach((p: { m: THREE.Mesh }) => {
        // shared geo/mat — only dispose once below
      });
      particleGeo.dispose();
      Object.values(particleMatCache).forEach(m => m.dispose());
      renderer.dispose();
      overlay.innerHTML = "";
    };
  }, [updateCamera, doSel, ND, CO, extent]);

  /* ---- external highlight ---- */
  useEffect(() => {
    if (!highlightNodeId) return;
    const s = sceneRef.current;
    if (!s) return;
    const mesh = s.mm[highlightNodeId];
    if (mesh) doSel(mesh);
    onHighlightConsumed?.();
  }, [highlightNodeId, doSel, onHighlightConsumed]);

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
  const orphanCount = ND.filter(n => n.orphan).length;
  const highRiskCount = ND.filter(n => (n.risk ?? 0) > 60).length;
  const hasEnrichment = ND.some(n => n.risk !== undefined);

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
        />

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
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-0.5 w-4" style={{ background: "#3d7acc" }} />
                    <span className="text-[10px] text-slate-300">Dependency</span>
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="inline-block h-0.5 w-4" style={{ background: "#ff4444" }} />
                    <span className="text-[10px] text-slate-300">Circular dependency</span>
                    {circularCount > 0 && <span className="text-[9px] text-red-400">{circularCount}</span>}
                  </div>
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
