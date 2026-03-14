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
  { id: "ctyp", lb: "City Types",        l: "db",  x: -5,    z: -1.5 },
  { id: "nxtd", lb: "NextAuth Types",    l: "db",  x: -1.5,  z: -3   },
  { id: "lcst", lb: "LocalStorage",      l: "db",  x: 2.5,   z: 0    },
  { id: "bcch", lb: "LLM Cache",         l: "db",  x: 6,     z: -1.5 },

  // ── Backend / service layer ──
  { id: "cart", lb: "Cartographer",       l: "be",  x: -6,    z: 2    },
  { id: "insp", lb: "Inspector",          l: "be",  x: -3,    z: -2   },
  { id: "guid", lb: "Guide Agent",        l: "be",  x: 0,     z: 2.5  },
  { id: "anlz", lb: "Static Analyzer",    l: "be",  x: 3,     z: -1   },
  { id: "ctgn", lb: "City Generator",     l: "be",  x: -1,    z: -0.5 },
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
  { id: "pCty", lb: "City Page",           l: "fe", x: 2,     z: 0    },
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

function classifyLayer(path: string): "db" | "be" | "api" | "fe" {
  const p = path.toLowerCase();
  if (/\/(api|routes|controllers|endpoints)\//.test(p) || /\/server\.(ts|js|mjs)$/.test(p))
    return "api";
  if (
    /\/(models?|schema|database|db|prisma|migrations?|types?|entities|seeds?)\//.test(p) ||
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

function cityToArchData(city: CitySchema): { ND: NodeDef[]; CO: Conn[] } {
  const allBuildings = city.city.districts.flatMap((d) => d.buildings);

  const ND: NodeDef[] = allBuildings.map((b) => ({
    id: b.id,
    lb: b.filename,
    l: classifyLayer(b.path),
    x: 0,
    z: 0,
  }));

  // position nodes per layer
  const byLayer: Record<string, NodeDef[]> = { db: [], be: [], api: [], fe: [] };
  ND.forEach((n) => byLayer[n.l].push(n));

  for (const layerNodes of Object.values(byLayer)) {
    const count = layerNodes.length;
    if (!count) continue;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.5)));
    const spacing = Math.min(2.5, 18 / cols);
    layerNodes.forEach((n, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const totalRows = Math.ceil(count / cols);
      n.x = (col - (cols - 1) / 2) * spacing;
      n.z = (row - (totalRows - 1) / 2) * (spacing * 0.85);
    });
  }

  const nodeIds = new Set(ND.map((n) => n.id));
  const CO: Conn[] = city.city.roads
    .filter((r) => nodeIds.has(r.from) && nodeIds.has(r.to) && r.from !== r.to)
    .map((r) => [r.from, r.to]);

  return { ND, CO };
}

/* ------------------------------------------------------------------ */
/*  LAYER CONFIG                                                       */
/* ------------------------------------------------------------------ */

const LAYERS: Record<string, { y: number; c: number; name: string }> = {
  db:  { y: -7,   c: 0xba7517, name: "database" },
  be:  { y: -2.5, c: 0x1d9e75, name: "backend" },
  api: { y: 2.5,  c: 0x7f77dd, name: "api" },
  fe:  { y: 7,    c: 0xd85a30, name: "frontend" },
};

const LAYER_KEYS = ["db", "be", "api", "fe"] as const;
const FILTER_BUTTONS = [
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
}

export default function ArchitectureMap({ onSelect, city }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [activeFilter, setActiveFilter] = useState("all");
  const [selData, setSelData] = useState<{ lb: string; lname: string; cnt: number } | null>(null);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  /* compute nodes/connections from repo data or fall back to static */
  const archData = useMemo(() => {
    if (city) return cityToArchData(city);
    return { ND: STATIC_ND, CO: STATIC_CO };
  }, [city]);
  const ND = archData.ND;
  const CO = archData.CO;
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
    labels: Record<string, HTMLDivElement>;
    ph: number;
    th: number;
    rr: number;
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

  const filterRef = useRef(activeFilter);
  filterRef.current = activeFilter;

  /* ---- updateCamera helper ---- */
  const updateCamera = useCallback((s: NonNullable<typeof sceneRef.current>) => {
    s.cam.position.set(
      s.rr * Math.sin(s.ph) * Math.sin(s.th),
      s.rr * Math.cos(s.ph),
      s.rr * Math.sin(s.ph) * Math.cos(s.th),
    );
    s.cam.lookAt(0, 0, 0);
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
        (n.material as THREE.MeshStandardMaterial).opacity = isSel || isAdj ? 1 : 0.16;
      });
    } else {
      setSelData(null);
      onSelectRef.current?.(null);
      s.ll.forEach((line) => {
        (line.material as THREE.LineBasicMaterial).opacity = 0.22;
        (line.material as THREE.LineBasicMaterial).color.setHex(0x3d7acc);
      });
      s.ml.forEach((n) => {
        (n.material as THREE.MeshStandardMaterial).opacity = 0.88;
      });
    }
  }, []);

  /* ---- filter logic ---- */
  const applyFilter = useCallback((id: string) => {
    const s = sceneRef.current;
    if (!s) return;
    s.filter = id;
    s.ml.forEach((m) => {
      m.visible = id === "all" || (m.userData as { l: string }).l === id;
    });
    Object.entries(s.labels).forEach(([nid, el]) => {
      const n = ndRef.current.find((x) => x.id === nid);
      el.style.display = id === "all" || n?.l === id ? "" : "none";
    });
  }, []);

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
    const cam = new THREE.PerspectiveCamera(52, W / H, 0.1, 200);

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
      const g = new THREE.GridHelper(22, 11, l.c, l.c);
      (g.material as THREE.Material).opacity = 0.08;
      (g.material as THREE.Material).transparent = true;
      g.position.y = l.y;
      scene.add(g);

      const pg = new THREE.PlaneGeometry(22, 22);
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

    /* nodes */
    const mm: Record<string, THREE.Mesh> = {};
    const ml: THREE.Mesh[] = [];

    ND.forEach((n) => {
      const ly = LAYERS[n.l];
      const geo = new THREE.BoxGeometry(1.05, 0.3, 0.62);
      const mat = new THREE.MeshStandardMaterial({
        color: ly.c,
        metalness: 0.15,
        roughness: 0.6,
        transparent: true,
        opacity: 0.88,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(n.x, ly.y, n.z);
      m.userData = { id: n.id, lb: n.lb, l: n.l, lname: ly.name };
      scene.add(m);
      mm[n.id] = m;
      ml.push(m);
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
      const mat = new THREE.LineBasicMaterial({
        color: 0x3d7acc,
        transparent: true,
        opacity: 0.22,
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { a, b };
      scene.add(line);
      ll.push(line);
    });

    /* animated particles */
    const pts2: { m: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; s: number }[] = [];
    cr.forEach(({ curve, b: bId }) => {
      const tly = LAYERS[ND.find((n) => n.id === bId)?.l || "api"];
      for (let i = 0; i < 2; i++) {
        const geo = new THREE.SphereGeometry(0.07, 5, 5);
        const mat = new THREE.MeshBasicMaterial({ color: tly?.c || 0x4af0d0 });
        const m = new THREE.Mesh(geo, mat);
        scene.add(m);
        pts2.push({ m, curve, t: Math.random(), s: 0.11 + Math.random() * 0.1 });
      }
    });

    /* HTML labels */
    const labels: Record<string, HTMLDivElement> = {};
    ND.forEach((n) => {
      const el = document.createElement("div");
      el.className = "arch-label";
      el.textContent = n.lb;
      overlay.appendChild(el);
      labels[n.id] = el;
    });

    /* state object */
    const s = {
      renderer,
      scene,
      cam,
      mm,
      ml,
      ll,
      cr,
      pts: pts2,
      labels,
      ph: 0.88,
      th: 0.55,
      rr: 26,
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
      s.lx = e.clientX;
      s.ly = e.clientY;
      s.dd = 0;
      s.hasDrag = false;
      canvas!.style.cursor = "grabbing";
    }
    function onMouseMove(e: MouseEvent) {
      if (s.drag) {
        s.dd += Math.abs(e.clientX - s.lx) + Math.abs(e.clientY - s.ly);
        if (s.dd > 4) s.hasDrag = true;
        s.th -= (e.clientX - s.lx) * 0.007;
        s.ph = Math.max(0.16, Math.min(1.46, s.ph - (e.clientY - s.ly) * 0.007));
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
      canvas!.style.cursor = s.hov ? "pointer" : "grab";
    }
    function onClick(e: MouseEvent) {
      if (!s.hasDrag) {
        const uv = getUV(e);
        doSel(pick(uv));
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      s.rr = Math.max(8, Math.min(60, s.rr + e.deltaY * 0.07));
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

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
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

      /* auto-rotate */
      if (!s.drag && !s.sel) {
        s.th += dt * 0.035;
        updateCamera(s);
      }

      /* particles */
      s.pts.forEach((p) => {
        p.t = (p.t + dt * p.s) % 1;
        p.m.position.copy(p.curve.getPoint(p.t));
      });

      /* labels */
      const cw = canvas!.clientWidth || s.W;
      ND.forEach((n) => {
        const m = mm[n.id];
        const lbl = labels[n.id];
        if (!m.visible) {
          lbl.style.display = "none";
          return;
        }
        tv.copy(m.position).project(cam);
        if (tv.z > 1) {
          lbl.style.display = "none";
          return;
        }
        lbl.style.display = "";
        lbl.style.left = (tv.x * 0.5 + 0.5) * cw + "px";
        lbl.style.top = (-tv.y * 0.5 + 0.5) * s.H + "px";

        const isHov = m === s.hov || m === s.sel;
        const isAdj = s.sel
          ? coRef.current.some(
              ([a, b]) =>
                (a === (s.sel!.userData as { id: string }).id && b === n.id) ||
                (b === (s.sel!.userData as { id: string }).id && a === n.id),
            )
          : false;
        lbl.style.opacity = isHov ? "1" : s.sel ? (isAdj ? "0.7" : "0.1") : "0.48";
        if (isHov) {
          lbl.classList.add("arch-hi");
        } else {
          lbl.classList.remove("arch-hi");
        }
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
      canvas.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      overlay.innerHTML = "";
    };
  }, [updateCamera, doSel, ND, CO]);

  /* ---- filter change handler ---- */
  const handleFilter = useCallback(
    (id: string) => {
      setActiveFilter(id);
      applyFilter(id);
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

  return (
    <div className="w-full">
      {/* filter buttons */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-slate-400">Layer:</span>
        {FILTER_BUTTONS.map((btn) => (
          <button
            key={btn.id}
            onClick={() => handleFilter(btn.id)}
            className={`rounded-full border border-slate-600/50 px-3 py-1 text-[11px] transition ${
              activeFilter === btn.id
                ? "border-cyan-300/60 bg-white text-slate-950"
                : "bg-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

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

        {/* selection indicator */}
        {selData && (
          <div
            className="pointer-events-none absolute bottom-3.5 right-3.5 rounded-lg border-[0.5px] border-white/15 px-3 py-2"
            style={{ background: "rgba(8,12,22,0.85)" }}
          >
            <span className="text-xs font-medium text-white">{selData.lb}</span>
            <span className="ml-2 text-[10px] capitalize text-white/40">{selData.lname}</span>
          </div>
        )}

        {/* hint text */}
        <div className="pointer-events-none absolute bottom-3.5 left-3.5 text-[10px] text-white/20">
          Drag to orbit · scroll to zoom · click a node
        </div>
      </div>

      {/* legend */}
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
    </div>
  );
}
