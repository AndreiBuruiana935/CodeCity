import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend-url";

export async function POST(req: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    const body = await req.json();
    const { building } = body;

    if (!building || !building.path) {
      return NextResponse.json(
        { error: "building data is required" },
        { status: 400 }
      );
    }

    // Proxy to backend summarizer
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${backendUrl}/api/summarize-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          return NextResponse.json({ summary: data.summary });
        }
      }
    } catch {
      // Fall through to local fallback
    }

    return NextResponse.json({
      summary: buildFallbackSummary(building),
    });
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
