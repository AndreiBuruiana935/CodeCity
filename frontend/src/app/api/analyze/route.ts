import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { parseRepoUrl } from "@/lib/github";
import { generateCity } from "@/lib/city-generator";
import { getBackendUrl } from "@/lib/backend-url";
import {
  summarizeBuildings,
  generateAIOnboarding,
} from "@/lib/ai-summarizer";

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
    const backendUrl = getBackendUrl();
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

    // AI enrichment is staged to respect Featherless concurrency capacity.
    // Stage 1: Cartographer (2 units). Stage 2: Summaries + Onboarding (1 + 1 units).
    const allBuildings = city.city.districts.flatMap((d) => d.buildings);

    let mapResult: PromiseSettledResult<Response>;
    try {
      const mapRes = await withTimeout(
        fetch(`${backendUrl}/api/map-repository`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoTree: allBuildings.map((b) => b.path).join("\n"),
            repoName: `${owner}/${repo}`,
          }),
        }),
        150000
      );
      mapResult = { status: "fulfilled", value: mapRes };
    } catch (error) {
      mapResult = { status: "rejected", reason: error };
    }

    const [summariesResult, onboardingResult] = await Promise.allSettled([
      withTimeout(
        summarizeBuildings(allBuildings, `${owner}/${repo}`, city.city.language),
        120000
      ),
      withTimeout(
        generateAIOnboarding(city, allBuildings),
        60000
      ),
    ]);

    const diagnostics = {
      totalFiles: allBuildings.length,
      filesWithDependencies: allBuildings.filter((b) => b.dependencies.length > 0).length,
      internalImportReferences: allBuildings.reduce(
        (sum, b) => sum + b.dependencies.filter((d) => d.startsWith(".") || d.startsWith("@/") || d.startsWith("~/") || d.startsWith("/")).length,
        0
      ),
      aiSummaryStatus: summariesResult.status,
      aiOnboardingStatus: onboardingResult.status,
      cartographerStatus: mapResult.status,
      cartographerAppliedRoles: 0,
    };

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
                    diagnostics.cartographerAppliedRoles += 1;
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

    return NextResponse.json({ city, onboarding, diagnostics });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
