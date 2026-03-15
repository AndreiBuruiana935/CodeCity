import {
  CitySchema,
  District,
  Building,
  Road,
  OnboardingSummary,
  TourStop,
  ReadingListItem,
  RiskReportItem,
} from "@/types/city";
import { analyzeFile, isEntryPoint, isSecuritySensitive } from "./analyzer";
import {
  fetchRepoTree,
  fetchFileContent,
  isBinaryFile,
  isCodeFile,
  checkRateLimit,
  GitHubFile,
} from "./github";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function detectLanguage(files: GitHubFile[]): string {
  const extCount: Record<string, number> = {};
  for (const f of files) {
    const ext = f.path.substring(f.path.lastIndexOf("."));
    extCount[ext] = (extCount[ext] || 0) + (f.size || 1);
  }
  const langMap: Record<string, string> = {
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript",
    ".py": "Python", ".go": "Go", ".rs": "Rust",
    ".java": "Java", ".kt": "Kotlin",
    ".rb": "Ruby", ".php": "PHP",
    ".cs": "C#", ".cpp": "C++", ".c": "C",
    ".swift": "Swift", ".dart": "Dart",
  };
  let maxSize = 0;
  let primaryExt = ".js";
  for (const [ext, size] of Object.entries(extCount)) {
    if (langMap[ext] && size > maxSize) {
      maxSize = size;
      primaryExt = ext;
    }
  }
  return langMap[primaryExt] || "Unknown";
}

function detectFramework(files: GitHubFile[]): string {
  const paths = new Set(files.map((f) => f.path));
  const hasFile = (name: string) =>
    paths.has(name) || files.some((f) => f.path.endsWith("/" + name));

  if (hasFile("next.config.js") || hasFile("next.config.ts") || hasFile("next.config.mjs"))
    return "Next.js";
  if (hasFile("nuxt.config.ts") || hasFile("nuxt.config.js")) return "Nuxt.js";
  if (hasFile("angular.json")) return "Angular";
  if (hasFile("svelte.config.js")) return "SvelteKit";
  if (hasFile("vue.config.js") || hasFile("vite.config.ts")) return "Vue";
  if (hasFile("remix.config.js")) return "Remix";
  if (hasFile("astro.config.mjs")) return "Astro";
  if (hasFile("manage.py")) return "Django";
  if (hasFile("requirements.txt") && files.some((f) => f.path.includes("flask")))
    return "Flask";
  if (hasFile("Cargo.toml")) return "Rust";
  if (hasFile("go.mod")) return "Go";
  if (hasFile("pom.xml") || hasFile("build.gradle")) return "Spring";
  if (hasFile("Gemfile")) return "Rails";
  if (hasFile("composer.json")) return "Laravel";
  if (hasFile("package.json")) return "Node.js";
  return "Unknown";
}

function detectArchitecture(files: GitHubFile[]): string {
  const paths = files.map((f) => f.path);
  if (
    paths.some((p) => p.startsWith("packages/")) ||
    paths.some((p) => /^apps?\//.test(p))
  )
    return "monorepo";
  if (paths.filter((p) => /^services\/[^/]+\//.test(p)).length > 2)
    return "microservices";
  if (
    paths.some((p) => p.includes("/models/") || p.includes("/model/")) &&
    paths.some((p) => p.includes("/views/") || p.includes("/view/")) &&
    paths.some((p) => p.includes("/controllers/") || p.includes("/controller/"))
  )
    return "MVC";
  if (paths.some((p) => p.includes("serverless") || p.includes("lambda")))
    return "serverless";
  return "monolith";
}

function shouldIncludeFile(path: string, includeTests: boolean): boolean {
  if (path.includes("node_modules/")) return false;
  if (path.includes("vendor/")) return false;
  if (path.includes(".git/")) return false;
  if (path.startsWith(".")) return false;
  if (!includeTests) {
    if (
      path.includes("__tests__/") ||
      path.includes("/test/") ||
      path.includes("/tests/") ||
      /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs)$/.test(path)
    )
      return false;
  }
  return true;
}

function classifyBuildingLayer(path: string, aiLayer?: Building["aiLayer"]): "database" | "backend" | "api" | "frontend" {
  if (aiLayer) return aiLayer;
  const p = path.toLowerCase();
  if (/(^|\/)(api|routes|controllers|endpoints|handlers)(\/|$)/.test(p) || /(^|\/)server\.(ts|js|mjs)$/.test(p)) return "api";
  if (/\.d\.ts$/.test(p) || /\/src\/types?\//.test(p)) return "backend";
  if (/\/(models?|schema|database|db|prisma|migrations?|entities|seeds?)\//.test(p) || /\.(sql|prisma)$/.test(p)) return "database";
  if (/(^|\/)(lib|services?|utils?|helpers?|middleware|config|scripts?|adapters|gateways|interceptors)(\/|$)/.test(p) || /\.(config|rc)\.(ts|js|mjs|cjs|json)$/.test(p)) return "backend";
  if (/(^|\/)(components?|pages?|views?|hooks?|ui)(\/|$)/.test(p) || /\.(tsx|jsx|css|scss|less)$/.test(p)) return "frontend";
  return "backend";
}

/**
 * Prioritize files for content fetching.
 * Entry points, security files, and code files get priority.
 */
function prioritizeFiles(files: GitHubFile[]): GitHubFile[] {
  const scored = files.map((f) => {
    let score = 0;
    if (isEntryPoint(f.path)) score += 100;
    if (isSecuritySensitive(f.path)) score += 80;
    if (isCodeFile(f.path)) score += 50;
    if (isBinaryFile(f.path)) score -= 1000;
    // Prefer smaller files (faster to fetch, more likely to be important code)
    if (f.size && f.size < 50000) score += 20;
    // Config files are useful
    if (f.path.includes("config") || f.path.includes("package.json"))
      score += 40;
    // Routes/controllers are important
    if (
      f.path.includes("route") ||
      f.path.includes("controller") ||
      f.path.includes("handler") ||
      f.path.includes("api/")
    )
      score += 60;
    // Pages and components import many things → important for road generation
    if (f.path.includes("/page.") || f.path.includes("/pages/"))
      score += 70;
    if (f.path.includes("/components/") || f.path.includes("/hooks/"))
      score += 55;
    // Layout and context files are architectural hubs
    if (f.path.includes("layout") || f.path.includes("Context") || f.path.includes("Provider"))
      score += 65;
    return { file: f, score };
  });

  return scored.sort((a, b) => b.score - a.score).map((s) => s.file);
}

/**
 * Create a minimal building from file metadata only (no content fetch needed).
 */
function createMetadataBuilding(file: GitHubFile, id: string): Building {
  const filename = file.path.split("/").pop() || file.path;
  const entryPoint = isEntryPoint(file.path);
  const secure = isSecuritySensitive(file.path);
  const isBin = isBinaryFile(file.path);

  let color = "#30D158";
  let colorLabel = "LOW_RISK";
  if (isBin) {
    color = "#8E8E93";
    colorLabel = "BINARY";
  } else if (secure) {
    color = "#BF5AF2";
    colorLabel = "SECURITY";
  } else if (entryPoint) {
    color = "#0A84FF";
    colorLabel = "ENTRY_POINT";
  }

  return {
    id,
    filename,
    path: file.path,
    height: isBin ? 1 : 5,
    color,
    colorLabel,
    riskScore: isBin ? 0 : secure ? 30 : entryPoint ? 20 : 10,
    complexity: 0,
    dependencies: [],
    dependencyCount: 0,
    linesOfCode: file.size ? Math.round(file.size / 40) : 0, // rough estimate
    entryPoint,
    securitySensitive: secure,
    functions: [],
    aiSummary: isBin
      ? "Binary file — no analysis available."
      : "Content not fetched — analysis based on metadata only.",
    aiWarnings: [],
    readingListPriority: 999,
    status: isBin ? "binary" : "available",
  };
}

export async function generateCity(
  owner: string,
  repo: string,
  options: {
    depth?: "full" | "shallow";
    includeTests?: boolean;
    githubToken?: string;
  } = {}
): Promise<{ city: CitySchema; onboarding: OnboardingSummary }> {
  const { depth = "full", includeTests = false, githubToken } = options;

  // Check rate limit before starting
  const rateLimit = await checkRateLimit(githubToken);
  console.log(
    `GitHub rate limit: ${rateLimit.remaining}/${rateLimit.limit} remaining`
  );

  // The tree API call costs 1 request, repo info costs 1
  if (rateLimit.remaining < 3) {
    throw new Error(
      `GitHub rate limit too low (${rateLimit.remaining} remaining). ` +
        (githubToken
          ? "Your token's rate limit will reset soon. Try again in a few minutes."
          : "Add a GitHub personal access token for 5,000 requests/hour instead of 60.")
    );
  }

  // Fetch tree — costs 2 API calls total (repo info + tree)
  const allFiles = await fetchRepoTree(owner, repo, githubToken);
  const files = allFiles.filter((f) => shouldIncludeFile(f.path, includeTests));

  const language = detectLanguage(files);
  const framework = detectFramework(files);
  const architecture = detectArchitecture(files);
  const repoTier =
    files.length > 1200 ? "very-large"
    : files.length > 600 ? "large"
    : files.length > 200 ? "medium"
    : "small";

  // In full mode, analyze all eligible in-repo code files deterministically.
  // Reserve a few requests for retries and API calls outside blob fetches.
  const availableRequests = Math.max(0, rateLimit.remaining - 5);
  const shallowMaxFiles = envInt("ANALYSIS_SHALLOW_MAX_FILES", 200);
  const fullMaxFiles = envInt("ANALYSIS_FULL_MAX_FILES", 1200);
  const filesToProcess = depth === "shallow"
    ? files.slice(0, shallowMaxFiles)
    : files.slice(0, fullMaxFiles);
  const eligibleContentFiles = filesToProcess.filter(
    (f) => !isBinaryFile(f.path) && isCodeFile(f.path)
  );

  const defaultFullCodeCap =
    repoTier === "very-large" ? 500
    : repoTier === "large" ? 700
    : 900;
  const fullCodeCap = envInt("ANALYSIS_FULL_CODE_CAP", defaultFullCodeCap);
  const shallowCodeCap = envInt("ANALYSIS_SHALLOW_CODE_CAP", 30);

  const requestedContentFetches =
    depth === "shallow"
      ? Math.min(shallowCodeCap, eligibleContentFiles.length)
      : Math.min(fullCodeCap, eligibleContentFiles.length);

  if (depth === "full" && requestedContentFetches > availableRequests) {
    throw new Error(
      `Not enough GitHub API budget for full analysis. Need ${requestedContentFetches} blob requests, have ${availableRequests}. Add/refresh a GitHub token or use shallow mode.`
    );
  }

  const maxContentFetches = Math.min(requestedContentFetches, availableRequests);

  console.log(
    `Will fetch content for up to ${maxContentFetches} of ${files.length} files`
  );

  // Prioritize only for shallow mode. Full mode fetches all code files.
  const prioritized = prioritizeFiles(files);
  const fetchSet = new Set(
    (depth === "shallow" ? prioritized : filesToProcess)
      .filter((f) => !isBinaryFile(f.path) && isCodeFile(f.path))
      .slice(0, maxContentFetches)
      .map((f) => f.path)
  );

  // Build a SHA lookup
  const shaMap = new Map<string, string>();
  for (const f of allFiles) {
    shaMap.set(f.path, f.sha);
  }

  const allBuildings: Building[] = [];
  let buildingCounter = 0;
  const buildingsByPath = new Map<string, Building>();

  // Process files: fetch content only for prioritized ones
  const defaultBatchSize =
    depth === "shallow"
      ? 12
      : repoTier === "very-large" ? 4
      : repoTier === "large" ? 6
      : 8;
  const BATCH_SIZE = envInt("ANALYSIS_FETCH_BATCH_SIZE", defaultBatchSize);

  // Split into content-fetch group and metadata-only group
  const contentFiles = filesToProcess.filter((f) => fetchSet.has(f.path));
  const metadataFiles = filesToProcess.filter((f) => !fetchSet.has(f.path));

  // Process content files in batches
  for (let i = 0; i < contentFiles.length; i += BATCH_SIZE) {
    const batch = contentFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const id = `bld_${String(++buildingCounter).padStart(3, "0")}`;
        const sha = shaMap.get(file.path);
        if (!sha) return createMetadataBuilding(file, id);

        const content = await fetchFileContent(
          owner,
          repo,
          file.path,
          sha,
          githubToken
        );
        if (!content) return createMetadataBuilding(file, id);
        return analyzeFile(file.path, content, id);
      })
    );

    for (const bld of results) {
      allBuildings.push(bld);
      buildingsByPath.set(bld.path, bld);
    }
  }

  // Process metadata-only files (no API calls needed)
  for (const file of metadataFiles) {
    const id = `bld_${String(++buildingCounter).padStart(3, "0")}`;
    const bld = createMetadataBuilding(file, id);
    allBuildings.push(bld);
    buildingsByPath.set(bld.path, bld);
  }

  // Group buildings into districts
  const districtMap = new Map<string, Building[]>();
  for (const bld of allBuildings) {
    const parts = bld.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!districtMap.has(dir)) districtMap.set(dir, []);
    districtMap.get(dir)!.push(bld);
  }

  const districts: District[] = [];
  let districtCounter = 0;
  for (const [dirName, buildings] of districtMap) {
    districts.push({
      id: `district_${String(++districtCounter).padStart(3, "0")}`,
      name: dirName,
      type: "folder",
      buildings,
    });
  }

  // Build roads from dependencies
  const roads: Road[] = [];
  const roadMap = new Map<string, { weight: number; hasTypeImport: boolean; crossLayer: boolean }>();
  for (const bld of allBuildings) {
    for (const dep of bld.dependencies) {
      const targetBld = findBuildingByImport(dep, bld.path, buildingsByPath);
      if (targetBld && targetBld.id !== bld.id) {
        const key = `${bld.id}->${targetBld.id}`;
        const prev = roadMap.get(key);
        const depPath = dep.toLowerCase();
        const isTypeImport = depPath.includes("/types/") || /\.d\.ts$/i.test(targetBld.path);
        const sourceLayer = classifyBuildingLayer(bld.path, bld.aiLayer);
        const targetLayer = classifyBuildingLayer(targetBld.path, targetBld.aiLayer);
        const crossLayer = sourceLayer !== targetLayer;
        roadMap.set(key, {
          weight: (prev?.weight || 0) + 1,
          hasTypeImport: Boolean(prev?.hasTypeImport) || isTypeImport,
          crossLayer: Boolean(prev?.crossLayer) || crossLayer,
        });
      }
    }
  }

  const cycleEdgeSet = detectCycleEdges(roadMap);
  for (const [key, meta] of roadMap) {
    const [from, to] = key.split("->");
    const isCircular = cycleEdgeSet.has(key);
    const type: Road["type"] = isCircular
      ? "circular"
      : meta.crossLayer
      ? "cross-layer"
      : meta.hasTypeImport
      ? "type-import"
      : "import";
    roads.push({ from, to, type, weight: meta.weight });
  }

  // Identify entry points and hotspots
  const entryPoints = allBuildings.filter((b) => b.entryPoint).map((b) => b.id);
  const hotspots = [...allBuildings]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10)
    .map((b) => b.id);

  // Assign reading list priorities
  const sorted = [...allBuildings]
    .filter((b) => b.status === "available")
    .sort((a, b) => {
      if (a.entryPoint && !b.entryPoint) return -1;
      if (!a.entryPoint && b.entryPoint) return 1;
      return b.riskScore - a.riskScore;
    });
  sorted.forEach((bld, i) => {
    bld.readingListPriority = i + 1;
  });

  const city: CitySchema = {
    city: {
      name: `${owner}/${repo}`,
      language,
      framework,
      architecture,
      districts,
      roads,
      entryPoints,
      hotspots,
    },
  };

  const onboarding = generateOnboarding(city, allBuildings);

  return { city, onboarding };
}

function findBuildingByImport(
  importPath: string,
  fromPath: string,
  buildingsByPath: Map<string, Building>
): Building | null {
  // Skip bare node_modules / external packages
  if (
    !importPath.startsWith(".") &&
    !importPath.startsWith("@/") &&
    !importPath.startsWith("~/") &&
    !importPath.startsWith("/")
  ) {
    return null;
  }

  const extensions = [
    "", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
    "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs",
  ];

  const tryCandidates = (basePath: string): Building | null => {
    const normalizedBase = basePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    const matches = new Map<string, Building>();
    for (const ext of extensions) {
      const candidate = normalizedBase + ext;
      const bld = buildingsByPath.get(candidate);
      if (bld) matches.set(bld.id, bld);
    }
    if (matches.size === 1) return matches.values().next().value || null;
    return null;
  };

  // Handle @/ and ~/ aliases → resolve to src/
  if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    const stripped = importPath.slice(2); // remove @/ or ~/
    // Try common src roots
    const srcPrefixes = ["src/", "frontend/src/", "app/", ""];
    for (const prefix of srcPrefixes) {
      const match = tryCandidates(prefix + stripped);
      if (match) return match;
    }
  }

  // Relative imports
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const fromDir = fromPath.split("/").slice(0, -1).join("/");
    const parts = importPath.split("/");
    const resolved = fromDir.split("/");

    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }

    const base = resolved.join("/");
    const match = tryCandidates(base);
    if (match) return match;
  }

  // Absolute import from repo roots commonly used by TS/Node projects.
  if (!importPath.startsWith(".")) {
    const rootPrefixes = ["", "src/", "frontend/src/", "backend/src/", "app/"];
    for (const prefix of rootPrefixes) {
      const match = tryCandidates(prefix + importPath);
      if (match) return match;
    }
  }

  return null;
}

function detectCycleEdges(
  roadMap: Map<string, { weight: number; hasTypeImport: boolean; crossLayer: boolean }>
): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const key of roadMap.keys()) {
    const [from, to] = key.split("->");
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from)!.add(to);
    if (!adjacency.has(to)) adjacency.set(to, new Set());
  }

  const indexMap = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let index = 0;
  const components: string[][] = [];

  const strongConnect = (node: string) => {
    indexMap.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) || []) {
      if (!indexMap.has(next)) {
        strongConnect(next);
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(next)!));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, indexMap.get(next)!));
      }
    }

    if (lowLink.get(node) === indexMap.get(node)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const top = stack.pop()!;
        onStack.delete(top);
        component.push(top);
        if (top === node) break;
      }
      components.push(component);
    }
  };

  for (const node of adjacency.keys()) {
    if (!indexMap.has(node)) strongConnect(node);
  }

  const cycleEdges = new Set<string>();
  for (const component of components) {
    if (component.length < 2) continue;
    const set = new Set(component);
    for (const from of component) {
      for (const to of adjacency.get(from) || []) {
        if (set.has(to)) {
          cycleEdges.add(`${from}->${to}`);
        }
      }
    }
  }

  return cycleEdges;
}

function generateOnboarding(
  city: CitySchema,
  buildings: Building[]
): OnboardingSummary {
  const available = buildings.filter((b) => b.status === "available");
  const totalFiles = buildings.length;
  const numDistricts = city.city.districts.length;

  const entryBuildings = available.filter((b) => b.entryPoint);
  const riskiest = [...available].sort((a, b) => b.riskScore - a.riskScore);
  const mostConnected = [...available].sort(
    (a, b) => b.dependencyCount - a.dependencyCount
  );
  const securityFiles = available.filter((b) => b.securitySensitive);

  const overallRisk =
    available.reduce((sum, b) => sum + b.riskScore, 0) /
    Math.max(available.length, 1);

  const plainEnglish = `This is a ${city.city.language} ${city.city.architecture} using ${city.city.framework} with ${totalFiles} files across ${numDistricts} modules. Risk level: ${overallRisk > 50 ? "HIGH" : overallRisk > 25 ? "MEDIUM" : "LOW"} (average risk score: ${Math.round(overallRisk)}/100).`;

  const guidedTour: TourStop[] = [];
  let stop = 1;
  if (entryBuildings.length > 0) {
    guidedTour.push({
      stop: stop++,
      label: "The Entry Point",
      file: entryBuildings[0].path,
      buildingId: entryBuildings[0].id,
      description:
        "This is where everything starts. All requests flow through here.",
    });
  }
  if (mostConnected.length > 0) {
    const core =
      mostConnected.find((b) => !b.entryPoint) || mostConnected[0];
    guidedTour.push({
      stop: stop++,
      label: "The Core Business Logic",
      file: core.path,
      buildingId: core.id,
      description:
        "The most connected file — this is what the app actually does.",
    });
  }
  if (available.length > 2) {
    const dataFiles = available.filter(
      (b) =>
        b.path.includes("model") ||
        b.path.includes("schema") ||
        b.path.includes("db") ||
        b.path.includes("database") ||
        b.path.includes("prisma") ||
        b.path.includes("migration")
    );
    const dataFile =
      dataFiles[0] || available[Math.floor(available.length / 2)];
    guidedTour.push({
      stop: stop++,
      label: "The Data Layer",
      file: dataFile.path,
      buildingId: dataFile.id,
      description: "This is how data is stored and retrieved.",
    });
  }
  if (riskiest.length > 0 && riskiest[0].riskScore > 20) {
    guidedTour.push({
      stop: stop++,
      label: "The Danger Zone",
      file: riskiest[0].path,
      buildingId: riskiest[0].id,
      description: `The riskiest area (score: ${riskiest[0].riskScore}/100) — high complexity and potential issues.`,
    });
  }
  if (securityFiles.length > 0) {
    guidedTour.push({
      stop: stop++,
      label: "The Security Gate",
      file: securityFiles[0].path,
      buildingId: securityFiles[0].id,
      description:
        "Security-sensitive code — handles auth, tokens, or encryption.",
    });
  }

  const readingList: ReadingListItem[] = available
    .filter((b) => b.readingListPriority <= 10)
    .sort((a, b) => a.readingListPriority - b.readingListPriority)
    .map((b) => ({
      priority: b.readingListPriority,
      file: b.path,
      buildingId: b.id,
      reason: b.entryPoint
        ? "Entry point — start here"
        : b.securitySensitive
        ? "Security-critical code"
        : `Risk score: ${b.riskScore}/100`,
      estimatedMinutes: Math.max(1, Math.round(b.linesOfCode / 50)),
    }));

  const riskReport: RiskReportItem[] = riskiest
    .slice(0, 10)
    .map((b, i) => ({
      rank: i + 1,
      file: b.path,
      buildingId: b.id,
      riskScore: b.riskScore,
      warnings: b.aiWarnings,
    }));

  return { plainEnglish, guidedTour, readingList, riskReport };
}
