import { Building, CitySchema, OnboardingSummary } from "@/types/city";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

function fallbackSummaryFromPrompt(b: Building): string {
  const parts: string[] = [];
  if (b.entryPoint)
    parts.push("Likely part of request/runtime entry flow and bootstrapping.");
  if (b.securitySensitive)
    parts.push("Touches security-sensitive logic and should be reviewed first.");
  if (b.dependencyCount > 6)
    parts.push(`High coupling (${b.dependencyCount} dependencies).`);
  if (b.complexity > 10)
    parts.push(`Elevated implementation complexity (${b.complexity}).`);
  if (b.functions.length > 0) {
    parts.push(
      `Main routines include ${b.functions
        .slice(0, 3)
        .map((f) => f.name)
        .join(", ")}${b.functions.length > 3 ? " and others" : ""}.`
    );
  }

  return (
    parts.join(" ") ||
    `${b.filename} defines module-level behavior with ${b.linesOfCode} LOC and ${b.dependencyCount} dependencies.`
  );
}

export async function summarizeBuildings(
  buildings: Building[],
  repoName: string,
  language: string
): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  // Priority-sort: entry points, security-sensitive, high-risk, high-complexity first
  const prioritized = [...buildings].sort((a, b) => {
    const score = (x: Building) =>
      (x.entryPoint ? 100 : 0) +
      (x.securitySensitive ? 80 : 0) +
      x.riskScore +
      Math.min(x.complexity, 50);
    return score(b) - score(a);
  });

  try {
    const res = await fetch(`${BACKEND_URL}/api/summarize-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buildings: prioritized.slice(0, 500).map((b) => ({
          path: b.path,
          entryPoint: b.entryPoint,
          securitySensitive: b.securitySensitive,
          riskScore: b.riskScore,
          complexity: b.complexity,
          dependencyCount: b.dependencyCount,
          linesOfCode: b.linesOfCode,
          functions: b.functions.slice(0, 8).map((f) => f.name),
        })),
        repoName,
        language,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.summaries) {
        for (const [path, summary] of Object.entries(data.summaries)) {
          if (typeof summary === "string") {
            summaries.set(path, summary);
          }
        }
      }
    }
  } catch {
    // Fall through to local summaries
  }

  for (const b of buildings) {
    if (!summaries.has(b.path)) {
      summaries.set(b.path, fallbackSummaryFromPrompt(b));
    }
  }

  return summaries;
}

export async function aiAnswerQuestion(
  question: string,
  city: CitySchema,
  onboarding: OnboardingSummary
): Promise<{
  answer: string;
  highlightedBuildings: string[];
  cameraFlyTo: string | null;
  confidence: number;
}> {
  const allBuildings = city.city.districts.flatMap((d) => d.buildings);

  try {
    const codeMap = allBuildings
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 50)
      .map((b) => `[${b.id}] ${b.path} risk:${b.riskScore} complexity:${b.complexity} deps:${b.dependencyCount}`)
      .join("\n");

    const fullContext = [
      onboarding?.plainEnglish || "",
      "",
      "=== FILE MAP ===",
      codeMap,
    ].join("\n");

    const res = await fetch(`${BACKEND_URL}/api/chat-guide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userQuery: question,
        projectSummary: fullContext,
        citySchema: {
          name: city.city.name,
          language: city.city.language,
          framework: city.city.framework,
          architecture: city.city.architecture,
          districts: city.city.districts.map((d) => ({ name: d.name })),
          entryPoints: city.city.entryPoints,
          hotspots: city.city.hotspots,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.answer) {
        const validIds = new Set(allBuildings.map((b) => b.id));
        const highlighted = (data.highlightedBuildings || []).filter((id: string) =>
          validIds.has(id)
        );
        return {
          answer: data.answer,
          highlightedBuildings: highlighted.slice(0, 10),
          cameraFlyTo: data.cameraFlyTo && validIds.has(data.cameraFlyTo)
            ? data.cameraFlyTo
            : highlighted[0] || null,
          confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
        };
      }
    }
  } catch {
    // Fall through to keyword search
  }

  // Fallback: keyword-based search
  const q = question.toLowerCase();
  const keywordMatches = allBuildings.filter((b) => {
    const text = `${b.path} ${b.filename} ${b.aiSummary} ${b.colorLabel}`.toLowerCase();
    return q
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .some((w) => text.includes(w));
  });
  const topRisk = [...allBuildings].sort((a, b) => b.riskScore - a.riskScore);
  const best = keywordMatches[0] || topRisk[0];

  return {
    answer: keywordMatches.length
      ? `Found ${keywordMatches.length} relevant file(s): ${keywordMatches
          .slice(0, 5)
          .map((b) => b.path)
          .join(", ")}.`
      : `Using static analysis fallback. Highest-risk hotspot is ${best?.path || "unknown"} (risk ${best?.riskScore || 0}/100).`,
    highlightedBuildings: keywordMatches.slice(0, 8).map((b) => b.id),
    cameraFlyTo: best?.id || null,
    confidence: keywordMatches.length > 0 ? 0.7 : 0.45,
  };
}

export async function generateAIOnboarding(
  city: CitySchema,
  buildings: Building[]
): Promise<string> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/generate-onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, buildings: buildings.slice(0, 20) }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.onboardingText) {
        return data.onboardingText;
      }
    }
  } catch {
    // Fall through to deterministic onboarding
  }

  const topRisk = [...buildings]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 6);
  const hotspots = topRisk.map((b) => b.path).join(", ");
  return `This is a ${city.city.language} ${city.city.architecture} project using ${city.city.framework} with ${buildings.length} files across ${city.city.districts.length} modules. Start with entry points and top-risk files to understand execution flow quickly. Current hotspots: ${hotspots || "none"}.`;
}
