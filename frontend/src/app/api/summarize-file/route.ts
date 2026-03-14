import { NextRequest, NextResponse } from "next/server";

const FEATHERLESS_BASE_URL =
  process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1";
const FEATHERLESS_API_KEY = process.env.FEATHERLESS_API_KEY;
const FEATHERLESS_ANALYSIS_MODEL =
  process.env.FEATHERLESS_ANALYSIS_MODEL || "gpt-4o-mini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { building } = body;

    if (!building || !building.path) {
      return NextResponse.json(
        { error: "building data is required" },
        { status: 400 }
      );
    }

    // If Featherless isn't configured, return a local fallback summary
    if (!FEATHERLESS_API_KEY) {
      return NextResponse.json({
        summary: buildFallbackSummary(building),
      });
    }

    const compact = {
      path: building.path,
      entryPoint: building.entryPoint,
      securitySensitive: building.securitySensitive,
      riskScore: building.riskScore,
      complexity: building.complexity,
      dependencyCount: building.dependencyCount,
      linesOfCode: building.linesOfCode,
      functions: (building.functions || []).slice(0, 10).map((f: { name: string }) => f.name),
      dependencies: (building.dependencies || []).slice(0, 10),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${FEATHERLESS_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FEATHERLESS_API_KEY}`,
        },
        body: JSON.stringify({
          model: FEATHERLESS_ANALYSIS_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are a senior software architect. Given file metadata, write a concise 2-3 sentence summary focusing on the file's architectural role, key responsibilities, and any risk or coupling concerns. Return ONLY the summary text, no JSON or formatting.",
            },
            {
              role: "user",
              content: JSON.stringify(compact),
            },
          ],
          temperature: 0.2,
          max_tokens: 300,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`Featherless summarize failed (${res.status})`);
        return NextResponse.json({
          summary: buildFallbackSummary(building),
        });
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      return NextResponse.json({
        summary: content || buildFallbackSummary(building),
      });
    } catch (err) {
      clearTimeout(timeout);
      console.error("Featherless summarize error:", err);
      return NextResponse.json({
        summary: buildFallbackSummary(building),
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

function buildFallbackSummary(b: {
  path?: string;
  filename?: string;
  entryPoint?: boolean;
  securitySensitive?: boolean;
  dependencyCount?: number;
  complexity?: number;
  linesOfCode?: number;
  functions?: { name: string }[];
}): string {
  const parts: string[] = [];
  if (b.entryPoint)
    parts.push("Likely part of the application's entry flow and bootstrapping.");
  if (b.securitySensitive)
    parts.push("Touches security-sensitive logic and should be reviewed carefully.");
  if ((b.dependencyCount || 0) > 6)
    parts.push(`High coupling with ${b.dependencyCount} dependencies.`);
  if ((b.complexity || 0) > 10)
    parts.push(`Elevated complexity score of ${b.complexity}.`);
  if (b.functions && b.functions.length > 0) {
    parts.push(
      `Key functions: ${b.functions
        .slice(0, 3)
        .map((f) => f.name)
        .join(", ")}${b.functions.length > 3 ? " and others" : ""}.`
    );
  }

  return (
    parts.join(" ") ||
    `${b.filename || b.path} contains ${b.linesOfCode || 0} lines of code with ${b.dependencyCount || 0} dependencies.`
  );
}
