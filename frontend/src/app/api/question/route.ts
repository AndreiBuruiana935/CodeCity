import { NextRequest, NextResponse } from "next/server";
import { CitySchema, QuestionResponse, Building, OnboardingSummary } from "@/types/city";
import { aiAnswerQuestion } from "@/lib/ai-summarizer";

function findBuildingsMatching(
  buildings: Building[],
  keywords: string[]
): Building[] {
  return buildings.filter((b) => {
    const searchText =
      `${b.path} ${b.filename} ${b.aiSummary} ${b.colorLabel}`.toLowerCase();
    return keywords.some((kw) => searchText.includes(kw.toLowerCase()));
  });
}

export async function POST(req: NextRequest) {
  try {
    const { question, city, onboarding } = (await req.json()) as {
      question: string;
      city: CitySchema;
      onboarding?: OnboardingSummary;
    };

    if (!question || !city) {
      return NextResponse.json(
        { error: "question and city are required" },
        { status: 400 }
      );
    }

    const allBuildings = city.city.districts.flatMap((d) => d.buildings);

    const aiEnabled =
      process.env.ENABLE_AI === "true" && !!process.env.FEATHERLESS_API_KEY;

    // Try AI-powered answer first only when explicitly enabled
    if (aiEnabled) {
      try {
        const fallbackOnboarding: OnboardingSummary = onboarding || {
          plainEnglish: `${city.city.language} ${city.city.architecture} using ${city.city.framework}`,
          guidedTour: [],
          readingList: [],
          riskReport: [],
        };

        const aiResult = await aiAnswerQuestion(
          question,
          city,
          fallbackOnboarding
        );

        const response: QuestionResponse = {
          answer: aiResult.answer,
          highlightedBuildings: aiResult.highlightedBuildings,
          cameraFlyTo: aiResult.cameraFlyTo,
          relatedDistricts: [],
          confidence: aiResult.confidence,
        };

        return NextResponse.json(response);
      } catch (err) {
        console.error("AI question failed, falling back to keyword search:", err);
      }
    }

    // Fallback: keyword-based search
    const q = question.toLowerCase();
    let response: QuestionResponse;

    if (
      q.includes("auth") ||
      q.includes("login") ||
      q.includes("session") ||
      q.includes("token")
    ) {
      const matches = findBuildingsMatching(allBuildings, [
        "auth", "login", "session", "token", "jwt", "passport",
        "middleware", "guard",
      ]);
      response = {
        answer: matches.length
          ? `Authentication logic found in ${matches.length} file(s): ${matches.map((b) => b.path).join(", ")}.`
          : "No authentication-related files found.",
        highlightedBuildings: matches.map((b) => b.id),
        cameraFlyTo: matches[0]?.id || null,
        relatedDistricts: [],
        confidence: matches.length > 0 ? 0.85 : 0.3,
      };
    } else if (
      q.includes("dangerous") ||
      q.includes("risk") ||
      q.includes("bug")
    ) {
      const sorted = [...allBuildings].sort(
        (a, b) => b.riskScore - a.riskScore
      );
      const top = sorted.slice(0, 5);
      response = {
        answer: `The riskiest file is **${top[0].path}** (score: ${top[0].riskScore}/100). ${top[0].aiWarnings.length ? "Warnings: " + top[0].aiWarnings.join("; ") : ""}`,
        highlightedBuildings: top.map((b) => b.id),
        cameraFlyTo: top[0].id,
        relatedDistricts: [],
        confidence: 0.92,
      };
    } else if (
      q.includes("read first") ||
      q.includes("start") ||
      q.includes("reading list")
    ) {
      const sorted = [...allBuildings]
        .filter((b) => b.readingListPriority < 999)
        .sort((a, b) => a.readingListPriority - b.readingListPriority)
        .slice(0, 5);
      response = {
        answer:
          "Recommended reading order:\n" +
          sorted
            .map(
              (b, i) =>
                `${i + 1}. **${b.path}** — ${b.entryPoint ? "Entry point" : `Risk: ${b.riskScore}/100`}`
            )
            .join("\n"),
        highlightedBuildings: sorted.map((b) => b.id),
        cameraFlyTo: sorted[0]?.id || null,
        relatedDistricts: [],
        confidence: 0.9,
      };
    } else if (
      q.includes("route") ||
      q.includes("api") ||
      q.includes("endpoint")
    ) {
      const matches = findBuildingsMatching(allBuildings, [
        "route", "controller", "handler", "endpoint", "api/",
      ]);
      response = {
        answer: matches.length
          ? `Found ${matches.length} API/route file(s): ${matches.map((b) => b.path).join(", ")}.`
          : "No API route files found.",
        highlightedBuildings: matches.map((b) => b.id),
        cameraFlyTo: matches[0]?.id || null,
        relatedDistricts: [],
        confidence: matches.length > 0 ? 0.85 : 0.4,
      };
    } else if (q.includes("entry") || q.includes("main")) {
      const entries = allBuildings.filter((b) => b.entryPoint);
      response = {
        answer: entries.length
          ? `Entry points: ${entries.map((b) => b.path).join(", ")}`
          : "No clear entry points detected.",
        highlightedBuildings: entries.map((b) => b.id),
        cameraFlyTo: entries[0]?.id || null,
        relatedDistricts: [],
        confidence: 0.88,
      };
    } else if (
      q.includes("explain") ||
      q.includes("overview") ||
      q.includes("what does")
    ) {
      response = {
        answer: `This is a **${city.city.language}** ${city.city.architecture} using **${city.city.framework}**. It has ${allBuildings.length} files in ${city.city.districts.length} modules. Main areas: ${city.city.districts.slice(0, 5).map((d) => d.name).join(", ")}.`,
        highlightedBuildings: [],
        cameraFlyTo: null,
        relatedDistricts: city.city.districts.slice(0, 5).map((d) => d.id),
        confidence: 0.8,
      };
    } else {
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const matches = findBuildingsMatching(allBuildings, words);
      response = {
        answer: matches.length
          ? `Found ${matches.length} related file(s): ${matches.slice(0, 5).map((b) => b.path).join(", ")}${matches.length > 5 ? ` and ${matches.length - 5} more` : ""}.`
          : "No matching files. Try keywords like 'auth', 'routes', 'risk', or file names.",
        highlightedBuildings: matches.slice(0, 10).map((b) => b.id),
        cameraFlyTo: matches[0]?.id || null,
        relatedDistricts: [],
        confidence: matches.length > 0 ? 0.6 : 0.2,
      };
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Question processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
