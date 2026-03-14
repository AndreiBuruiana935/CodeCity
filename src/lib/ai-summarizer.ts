import { Building, CitySchema, OnboardingSummary } from "@/types/city";

export async function summarizeBuildings(
  buildings: Building[],
  _repoName: string,
  _language: string
): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  for (const b of buildings) {
    summaries.set(b.path, generateFallbackSummary(b));
  }

  return summaries;
}

function generateFallbackSummary(b: Building): string {
  const parts: string[] = [];
  if (b.entryPoint) parts.push("Entry point for the application.");
  if (b.securitySensitive) parts.push("Handles security-sensitive operations.");
  if (b.complexity > 10) parts.push(`High complexity (${b.complexity}).`);
  if (b.functions.length > 0)
    parts.push(
      `Contains ${b.functions.length} function(s): ${b.functions
        .slice(0, 3)
        .map((f) => f.name)
        .join(", ")}${b.functions.length > 3 ? "..." : ""}.`
    );
  if (b.dependencyCount > 5)
    parts.push(`Heavily connected with ${b.dependencyCount} dependencies.`);
  return parts.join(" ") || `${b.filename} — ${b.linesOfCode} lines of code.`;
}

export async function aiAnswerQuestion(
  question: string,
  city: CitySchema,
  _onboarding: OnboardingSummary
): Promise<{
  answer: string;
  highlightedBuildings: string[];
  cameraFlyTo: string | null;
  confidence: number;
}> {
  const allBuildings = city.city.districts.flatMap((d) => d.buildings);
  const q = question.toLowerCase();

  const keywordMatches = allBuildings.filter((b) => {
    const text = `${b.path} ${b.filename} ${b.aiSummary} ${b.colorLabel}`.toLowerCase();
    return q
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .some((w) => text.includes(w));
  });

  const top = [...allBuildings].sort((a, b) => b.riskScore - a.riskScore).slice(0, 3);
  const best = keywordMatches[0] || top[0];

  let answer = "AI mode is currently disabled. Showing local static analysis results.";
  if (keywordMatches.length > 0) {
    answer = `Found ${keywordMatches.length} relevant file(s): ${keywordMatches
      .slice(0, 5)
      .map((b) => b.path)
      .join(", ")}.`;
  } else if (best) {
    answer = `AI mode is disabled. Highest-risk hotspot right now is ${best.path} (risk ${best.riskScore}/100).`;
  }

  return {
    answer,
    highlightedBuildings: keywordMatches.slice(0, 8).map((b) => b.id),
    cameraFlyTo: best?.id || null,
    confidence: keywordMatches.length > 0 ? 0.7 : 0.45,
  };
}

export async function generateAIOnboarding(
  city: CitySchema,
  buildings: Building[]
): Promise<string> {
  const topRisk = [...buildings].sort((a, b) => b.riskScore - a.riskScore).slice(0, 3);
  const hotspots = topRisk.map((b) => b.path).join(", ");
  return `This is a ${city.city.language} ${city.city.architecture} project using ${city.city.framework} with ${buildings.length} files across ${city.city.districts.length} modules. Start with entry points and top-risk files to understand execution flow quickly. Current hotspots: ${hotspots || "none"}.`;
}
