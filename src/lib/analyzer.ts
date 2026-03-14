import { Building, FunctionInfo } from "@/types/city";

const ENTRY_POINT_PATTERNS = [
  /^(index|main|app|server|handler)\.(ts|tsx|js|jsx|py|go|rs|java|rb)$/i,
  /^(src|lib)\/(index|main|app|server)\./i,
  /manage\.py$/,
  /^cmd\/.*\/main\.go$/,
  /^(bin|scripts)\//,
];

const SECURITY_PATTERNS = [
  /auth/i, /login/i, /session/i, /token/i, /jwt/i,
  /passport/i, /middleware/i, /guard/i, /crypto/i,
  /secret/i, /password/i, /credential/i, /oauth/i,
  /permission/i, /role/i, /acl/i, /\.env/,
];

const DEPRECATED_PATTERNS = [
  /TODO/g, /FIXME/g, /HACK/g, /DEPRECATED/g, /XXX/g,
];

export function isEntryPoint(path: string): boolean {
  const filename = path.split("/").pop() || "";
  return ENTRY_POINT_PATTERNS.some(
    (p) => p.test(filename) || p.test(path)
  );
}

export function isSecuritySensitive(path: string, content?: string): boolean {
  const filename = path.split("/").pop() || "";
  if (SECURITY_PATTERNS.some((p) => p.test(filename) || p.test(path)))
    return true;
  if (content) {
    const securityKeywords = [
      "password", "secret", "token", "apikey", "api_key",
      "private_key", "encrypt", "decrypt", "hash", "salt",
    ];
    const lower = content.toLowerCase();
    return securityKeywords.some((kw) => lower.includes(kw));
  }
  return false;
}

export function calculateCyclomaticComplexity(content: string): number {
  let complexity = 1;
  const patterns = [
    /\bif\b/g, /\belse\s+if\b/g, /\belif\b/g,
    /\bfor\b/g, /\bwhile\b/g,
    /\bcase\b/g, /\bcatch\b/g, /\bexcept\b/g,
    /&&/g, /\|\|/g,
    /\?\s*[^:]/g, // ternary
  ];
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

export function calculateNestingDepth(content: string): number {
  let maxDepth = 0;
  let depth = 0;
  for (const char of content) {
    if (char === "{" || char === "(" && depth > 0) {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === "}" || char === ")" && depth > 0) {
      depth = Math.max(0, depth - 1);
    }
  }
  return maxDepth;
}

export function extractFunctions(content: string, path: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split("\n");
  const ext = path.substring(path.lastIndexOf("."));

  const patterns: RegExp[] = [];
  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    patterns.push(
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/,
      /(\w+)\s*\(([^)]*)\)\s*\{/,
    );
  } else if (ext === ".py") {
    patterns.push(/def\s+(\w+)\s*\(([^)]*)\)/);
  } else if (ext === ".go") {
    patterns.push(/func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(([^)]*)\)/);
  } else if (ext === ".java" || ext === ".kt") {
    patterns.push(
      /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(([^)]*)\)/
    );
  } else if (ext === ".rb") {
    patterns.push(/def\s+(\w+)(?:\(([^)]*)\))?/);
  } else if (ext === ".rs") {
    patterns.push(/fn\s+(\w+)\s*\(([^)]*)\)/);
  }

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern);
      if (match && match[1] && !["if", "for", "while", "switch", "catch"].includes(match[1])) {
        const params = match[2]
          ? match[2].split(",").map((p) => p.trim().split(/[:\s]/)[0]).filter(Boolean)
          : [];
        // Estimate function end
        let endLine = i;
        let braceCount = 0;
        let started = false;
        for (let j = i; j < Math.min(i + 200, lines.length); j++) {
          for (const c of lines[j]) {
            if (c === "{") { braceCount++; started = true; }
            if (c === "}") braceCount--;
          }
          if (started && braceCount <= 0) {
            endLine = j;
            break;
          }
          if (j === Math.min(i + 200, lines.length) - 1) endLine = j;
        }
        // Calc function complexity
        const fnContent = lines.slice(i, endLine + 1).join("\n");
        const fnComplexity = calculateCyclomaticComplexity(fnContent);
        functions.push({
          name: match[1],
          lines: `${i + 1}-${endLine + 1}`,
          complexity: fnComplexity,
          params,
        });
        break;
      }
    }
  }
  return functions;
}

export function extractDependencies(content: string, path: string): string[] {
  const deps = new Set<string>();
  const ext = path.substring(path.lastIndexOf("."));

  // JS/TS imports
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      deps.add(match[1]);
    }
  }

  // Python imports
  if (ext === ".py") {
    const pyRegex = /(?:from|import)\s+([\w.]+)/g;
    let match;
    while ((match = pyRegex.exec(content)) !== null) {
      deps.add(match[1]);
    }
  }

  // Go imports
  if (ext === ".go") {
    const goRegex = /"([^"]+)"/g;
    let match;
    while ((match = goRegex.exec(content)) !== null) {
      deps.add(match[1]);
    }
  }

  // Java imports
  if ([".java", ".kt"].includes(ext)) {
    const javaRegex = /import\s+([\w.]+)/g;
    let match;
    while ((match = javaRegex.exec(content)) !== null) {
      deps.add(match[1]);
    }
  }

  // Rust use
  if (ext === ".rs") {
    const rsRegex = /use\s+([\w:]+)/g;
    let match;
    while ((match = rsRegex.exec(content)) !== null) {
      deps.add(match[1]);
    }
  }

  return Array.from(deps);
}

function countDeprecatedPatterns(content: string): number {
  let count = 0;
  for (const pattern of DEPRECATED_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

export function calculateRiskScore(
  complexity: number,
  loc: number,
  nestingDepth: number,
  depCount: number,
  isSecure: boolean,
  deprecatedCount: number
): number {
  let score = 0;
  score += Math.min(complexity * 2, 40);
  score += Math.min(loc / 20, 15);
  score += Math.min(nestingDepth * 3, 15);
  score += Math.min(depCount * 2, 10);
  if (isSecure) score += 10;
  score += Math.min(deprecatedCount * 2, 10);
  return Math.min(Math.round(score), 100);
}

export function getColorForFile(
  complexity: number,
  depCount: number,
  isEntry: boolean,
  isSecure: boolean,
  deprecatedCount: number
): { color: string; label: string } {
  if (isSecure) return { color: "#BF5AF2", label: "SECURITY" };
  if (isEntry) return { color: "#0A84FF", label: "ENTRY_POINT" };
  if (complexity > 10) return { color: "#FF3B30", label: "HIGH_RISK" };
  if (deprecatedCount > 3) return { color: "#FF9F0A", label: "DEPRECATED" };
  if (depCount > 5) return { color: "#FFD60A", label: "HIGH_DEPS" };
  return { color: "#30D158", label: "LOW_RISK" };
}

export function analyzeFile(
  path: string,
  content: string,
  id: string
): Building {
  const loc = content.split("\n").length;
  const complexity = calculateCyclomaticComplexity(content);
  const nestingDepth = calculateNestingDepth(content);
  const deps = extractDependencies(content, path);
  const funcs = extractFunctions(content, path);
  const entryPoint = isEntryPoint(path);
  const secure = isSecuritySensitive(path, content);
  const deprecatedCount = countDeprecatedPatterns(content);

  const riskScore = calculateRiskScore(
    complexity, loc, nestingDepth, deps.length, secure, deprecatedCount
  );
  const { color, label } = getColorForFile(
    complexity, deps.length, entryPoint, secure, deprecatedCount
  );

  const height = Math.min(
    Math.round(
      (complexity * 2 + loc / 10 + nestingDepth * 3 + funcs.length * 2) / 2
    ),
    100
  );

  const warnings: string[] = [];
  if (complexity > 15) warnings.push(`High cyclomatic complexity: ${complexity}`);
  if (nestingDepth > 5) warnings.push(`Deep nesting: ${nestingDepth} levels`);
  if (deps.length > 10) warnings.push(`Many dependencies: ${deps.length} imports`);
  if (loc > 500) warnings.push(`Large file: ${loc} lines`);
  if (deprecatedCount > 0) warnings.push(`${deprecatedCount} TODO/FIXME/HACK comments found`);

  const filename = path.split("/").pop() || path;

  return {
    id,
    filename,
    path,
    height: Math.max(height, 3),
    color,
    colorLabel: label,
    riskScore,
    complexity,
    dependencies: deps,
    dependencyCount: deps.length,
    linesOfCode: loc,
    entryPoint,
    securitySensitive: secure,
    functions: funcs.slice(0, 20),
    aiSummary: "",
    aiWarnings: warnings,
    readingListPriority: 0,
    status: "available",
  };
}
