import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { parseRepoUrl } from "@/lib/github";
import { generateCity } from "@/lib/city-generator";
import {
  summarizeBuildings,
  generateAIOnboarding,
} from "@/lib/ai-summarizer";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export const maxDuration = 300;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
    });
    const body = await req.json();
    const { repoUrl, options = {} } = body;

    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    const { owner, repo } = parseRepoUrl(repoUrl);
    const oauthToken = (token as { accessToken?: string } | null)?.accessToken;
    const effectiveToken = options.githubToken || oauthToken;
    const { city, onboarding } = await generateCity(owner, repo, {
      depth: options.depth || "full",
      includeTests: options.includeTests ?? false,
      githubToken: effectiveToken,
    });

    // AI-powered enrichment — all three run in parallel
    // Summaries use 7B (1 unit ×2 concurrent = 2u), Onboarding 7B (1u), Cartographer 32B (2u)
    // Peak = 5 units vs 4 limit, handled by backend 429 retry-with-backoff
    const allBuildings = city.city.districts.flatMap((d) => d.buildings);

    const [summariesResult, onboardingResult, mapResult] = await Promise.allSettled([
      withTimeout(
        summarizeBuildings(allBuildings, `${owner}/${repo}`, city.city.language),
        120000
      ),
      withTimeout(
        generateAIOnboarding(city, allBuildings),
        60000
      ),
      withTimeout(
        fetch(`${BACKEND_URL}/api/map-repository`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoTree: allBuildings.map((b) => b.path).join("\n"),
            repoName: `${owner}/${repo}`,
          }),
        }),
        150000
      ),
    ]);

    // Merge summaries
    if (summariesResult.status === "fulfilled") {
      const summaries = summariesResult.value;
      for (const district of city.city.districts) {
        for (const building of district.buildings) {
          const summary = summaries.get(building.path);
          if (summary) building.aiSummary = summary;
        }
      }
    } else {
      console.error("AI summaries failed:", summariesResult.reason);
    }

    // Merge onboarding
    if (onboardingResult.status === "fulfilled" && onboardingResult.value) {
      onboarding.plainEnglish = onboardingResult.value;
    } else if (onboardingResult.status === "rejected") {
      console.error("AI onboarding failed:", onboardingResult.reason);
    }

    // Merge Cartographer data
    if (mapResult.status === "fulfilled") {
      try {
        const mapRes = mapResult.value;
        if (mapRes.ok) {
          const mapData = await mapRes.json();
          if (mapData.districtMap) {
            if (mapData.districtMap.fileRoles) {
              city.city.fileRoles = mapData.districtMap.fileRoles;
              const roleMap = new Map<string, { role: string; layer: string }>(
                mapData.districtMap.fileRoles.map((r: { file: string; role: string; layer: string }) => [r.file, { role: r.role, layer: r.layer }])
              );
              for (const district of city.city.districts) {
                for (const building of district.buildings) {
                  const info = roleMap.get(building.path);
                  if (info) {
                    building.architecturalRole = info.role as import("@/types/city").ArchitecturalRole;
                    const validLayers = ["database", "backend", "api", "frontend"] as const;
                    if (validLayers.includes(info.layer as typeof validLayers[number])) {
                      building.aiLayer = info.layer as typeof validLayers[number];
                    }
                  }
                }
              }
            }
            if (mapData.districtMap.circularDependencies) {
              city.city.circularDependencies = mapData.districtMap.circularDependencies;
            }
            if (mapData.districtMap.testCoverage) {
              city.city.testCoverage = mapData.districtMap.testCoverage;
            }
          }
        }
      } catch (parseErr) {
        console.error("Cartographer response parse failed:", parseErr);
      }
    } else {
      console.error("Cartographer role analysis failed:", mapResult.reason);
    }

    // Send webhook if configured
    if (options.webhookUrl) {
      const topRisk = [...allBuildings].sort(
        (a, b) => b.riskScore - a.riskScore
      )[0];
      try {
        await fetch(options.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "analysis_complete",
            repo: `${owner}/${repo}`,
            timestamp: new Date().toISOString(),
            summary: {
              totalFiles: allBuildings.length,
              riskLevel:
                onboarding.riskReport[0]?.riskScore > 50
                  ? "HIGH"
                  : onboarding.riskReport[0]?.riskScore > 25
                  ? "MEDIUM"
                  : "LOW",
              hotspots: city.city.hotspots.length,
              topRiskFile: topRisk?.path || "N/A",
              language: city.city.language,
              framework: city.city.framework,
            },
          }),
        });
      } catch {
        // Webhook delivery failed silently
      }
    }

    return NextResponse.json({ city, onboarding });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
