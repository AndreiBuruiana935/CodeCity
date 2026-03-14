import { NextRequest, NextResponse } from "next/server";
import { parseRepoUrl } from "@/lib/github";
import { generateCity } from "@/lib/city-generator";
import {
  summarizeBuildings,
  generateAIOnboarding,
} from "@/lib/ai-summarizer";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repoUrl, options = {} } = body;

    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    const { owner, repo } = parseRepoUrl(repoUrl);
    const { city, onboarding } = await generateCity(owner, repo, {
      depth: options.depth || "full",
      includeTests: options.includeTests ?? false,
      githubToken: options.githubToken,
    });

    // AI-powered summaries
    const allBuildings = city.city.districts.flatMap((d) => d.buildings);
    const aiEnabled =
      process.env.ENABLE_AI === "true" &&
      !!process.env.ANTHROPIC_API_KEY &&
      options.enableAI === true;

    if (aiEnabled) {
      try {
        // Generate AI summaries for buildings
        const summaries = await summarizeBuildings(
          allBuildings,
          `${owner}/${repo}`,
          city.city.language
        );
        for (const district of city.city.districts) {
          for (const building of district.buildings) {
            const summary = summaries.get(building.path);
            if (summary) building.aiSummary = summary;
          }
        }

        // Generate AI onboarding summary
        const aiSummary = await generateAIOnboarding(city, allBuildings);
        if (aiSummary) onboarding.plainEnglish = aiSummary;
      } catch (err) {
        console.error("AI enrichment failed, using static analysis:", err);
      }
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
