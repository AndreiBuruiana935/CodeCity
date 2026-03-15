import { NextRequest, NextResponse } from "next/server";
import { CitySchema, QuestionResponse, Building, OnboardingSummary } from "@/types/city";
import { getBackendUrl } from "@/lib/backend-url";

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
    const backendUrl = getBackendUrl();
    const { question, city, onboarding, messages = [] } = (await req.json()) as {
      question: string;
      city: CitySchema;
      onboarding?: OnboardingSummary;
      messages?: Array<{ role: string; content: string }>;
    };

    if (!question || !city) {
      return NextResponse.json(
        { error: "question and city are required" },
        { status: 400 }
      );
    }

    const allBuildings = city.city.districts.flatMap((d) => d.buildings);

    // Try AI-powered Navigator via backend
    try {
      const codeMap = allBuildings
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 50)
        .map((b) => `[${b.id}] ${b.path} risk:${b.riskScore} complexity:${b.complexity} deps:${b.dependencyCount}${b.aiSummary ? ` — ${b.aiSummary}` : ""}`)
        .join("\n");

      const fullContext = [
        onboarding?.plainEnglish || `${city.city.language} ${city.city.architecture} using ${city.city.framework}`,
        "",
        "=== FILE MAP ===",
        codeMap,
      ].join("\n");

      const res = await fetch(`${backendUrl}/api/chat-guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userQuery: question,
          projectSummary: fullContext,
          messages,
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

          const response: QuestionResponse = {
            answer: data.answer,
            highlightedBuildings: highlighted.slice(0, 10),
            cameraFlyTo: data.cameraFlyTo && validIds.has(data.cameraFlyTo)
              ? data.cameraFlyTo
              : highlighted[0] || null,
            relatedDistricts: data.relatedDistricts || [],
            confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
            detectedLanguage: data.detectedLanguage || "en",
            responseType: data.responseType || "explanation",
          };

          return NextResponse.json(response);
        }
      }
    } catch (err) {
      console.error("Navigator backend call failed, falling back to keyword search:", err);
    }

    // Fallback: smart keyword search with conversational responses
    const q = question.toLowerCase();
    const lang = city.city.language;
    const fw = city.city.framework;
    let response: QuestionResponse;

    if (
      q.includes("auth") || q.includes("login") || q.includes("session") ||
      q.includes("token") || q.includes("password") || q.includes("sign in")
    ) {
      const matches = findBuildingsMatching(allBuildings, [
        "auth", "login", "session", "token", "jwt", "passport", "middleware", "guard", "credential",
      ]);
      response = {
        answer: matches.length
          ? `Great question! The authentication logic lives in **${matches.length} file${matches.length > 1 ? "s" : ""}**. The main ones to look at are:\n\n${matches.slice(0, 5).map((b, i) => `${i + 1}. **${b.path}** — ${b.aiSummary || `Risk score: ${b.riskScore}`}`).join("\n")}\n\nI've highlighted them on the map. Click any to see its details.`
          : "I couldn't find any authentication-related files in this codebase. It may use an external auth service, or the auth logic might be named differently.",
        highlightedBuildings: matches.map((b) => b.id),
        cameraFlyTo: matches[0]?.id || null,
        relatedDistricts: [],
        confidence: matches.length > 0 ? 0.85 : 0.3,
      };
    } else if (
      q.includes("dangerous") || q.includes("risk") || q.includes("bug") ||
      q.includes("problem") || q.includes("issue") || q.includes("worry")
    ) {
      const sorted = [...allBuildings].sort((a, b) => b.riskScore - a.riskScore);
      const top = sorted.slice(0, 5);
      response = {
        answer: `Here are the riskiest files that need attention:\n\n${top.map((b, i) => `${i + 1}. **${b.path}** — Risk: ${b.riskScore}/100${b.aiWarnings.length ? ` ⚠ ${b.aiWarnings[0]}` : ""}`).join("\n")}\n\nThe most concerning is **${top[0].path}** with a risk score of ${top[0].riskScore}. I'd recommend starting there.`,
        highlightedBuildings: top.map((b) => b.id),
        cameraFlyTo: top[0].id,
        relatedDistricts: [],
        confidence: 0.92,
      };
    } else if (
      q.includes("read first") || q.includes("start") || q.includes("begin") ||
      q.includes("reading list") || q.includes("where do i") || q.includes("new to")
    ) {
      const sorted = [...allBuildings]
        .filter((b) => b.readingListPriority < 999)
        .sort((a, b) => a.readingListPriority - b.readingListPriority)
        .slice(0, 5);
      const fallback = sorted.length === 0
        ? allBuildings.filter(b => b.entryPoint).slice(0, 3)
        : sorted;
      response = {
        answer: `Welcome! Here's the best way to understand this codebase:\n\n${fallback.map((b, i) => `${i + 1}. **${b.path}** — ${b.entryPoint ? "This is an entry point where everything starts" : b.aiSummary || `Complexity: ${b.complexity}`}`).join("\n")}\n\nStart with #1 and work your way down. Each builds on the last.`,
        highlightedBuildings: fallback.map((b) => b.id),
        cameraFlyTo: fallback[0]?.id || null,
        relatedDistricts: [],
        confidence: 0.9,
      };
    } else if (
      q.includes("route") || q.includes("api") || q.includes("endpoint") ||
      q.includes("request") || q.includes("url")
    ) {
      const matches = findBuildingsMatching(allBuildings, [
        "route", "controller", "handler", "endpoint", "api/",
      ]);
      response = {
        answer: matches.length
          ? `This project has **${matches.length} API/route file${matches.length > 1 ? "s" : ""}**:\n\n${matches.slice(0, 6).map((b, i) => `${i + 1}. **${b.path}** — ${b.aiSummary || `${b.linesOfCode} lines`}`).join("\n")}\n\nThese handle the incoming requests. Click on any to explore its dependencies.`
          : "I couldn't find dedicated API route files. The endpoints might be defined differently in this project.",
        highlightedBuildings: matches.map((b) => b.id),
        cameraFlyTo: matches[0]?.id || null,
        relatedDistricts: [],
        confidence: matches.length > 0 ? 0.85 : 0.4,
      };
    } else if (q.includes("entry") || q.includes("main") || q.includes("index")) {
      const entries = allBuildings.filter((b) => b.entryPoint);
      response = {
        answer: entries.length
          ? `The entry points are where the application starts executing:\n\n${entries.map((b, i) => `${i + 1}. **${b.path}** — ${b.aiSummary || "Application entry point"}`).join("\n")}\n\nThese are highlighted on the map with cyan rings.`
          : "No clear entry points were detected. The app might use a framework-specific bootstrapping mechanism.",
        highlightedBuildings: entries.map((b) => b.id),
        cameraFlyTo: entries[0]?.id || null,
        relatedDistricts: [],
        confidence: 0.88,
      };
    } else if (
      q.includes("explain") || q.includes("overview") || q.includes("what does") ||
      q.includes("what is") || q.includes("tell me about") || q.includes("describe") ||
      q.includes("how does") || q.includes("summary")
    ) {
      const entryCount = allBuildings.filter(b => b.entryPoint).length;
      const highRisk = allBuildings.filter(b => b.riskScore > 60).length;
      response = {
        answer: `This is a **${lang}** project${fw ? ` using **${fw}**` : ""} with a ${city.city.architecture} architecture.\n\n📊 **Quick stats:**\n- ${allBuildings.length} files across ${city.city.districts.length} modules\n- ${entryCount} entry point${entryCount !== 1 ? "s" : ""}\n- ${highRisk} high-risk file${highRisk !== 1 ? "s" : ""}\n- ${city.city.roads.length} dependency connections\n\n**Main areas:** ${city.city.districts.slice(0, 5).map(d => d.name).join(", ")}${city.city.districts.length > 5 ? ` and ${city.city.districts.length - 5} more` : ""}\n\nClick on any building in the 3D map to explore it, or ask me about specific parts!`,
        highlightedBuildings: [],
        cameraFlyTo: null,
        relatedDistricts: city.city.districts.slice(0, 5).map((d) => d.id),
        confidence: 0.8,
      };
    } else if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
      response = {
        answer: `Hey! 👋 I'm your architecture guide for this ${lang} project. I can help you understand:\n\n- **"What does this project do?"** — Overview\n- **"Where should I start reading?"** — Reading list\n- **"Show me the risky files"** — Risk analysis\n- **"Where is the auth logic?"** — Find specific code\n- **"What are the API routes?"** — API overview\n\nOr just ask anything in your own words!`,
        highlightedBuildings: [],
        cameraFlyTo: null,
        relatedDistricts: [],
        confidence: 1.0,
      };
    } else {
      // General search — try to match files by keywords
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const matches = findBuildingsMatching(allBuildings, words);
      response = {
        answer: matches.length
          ? `I found **${matches.length} file${matches.length > 1 ? "s" : ""}** related to your question:\n\n${matches.slice(0, 5).map((b, i) => `${i + 1}. **${b.path}** — ${b.aiSummary || `${b.linesOfCode} lines, risk: ${b.riskScore}`}`).join("\n")}${matches.length > 5 ? `\n\n...and ${matches.length - 5} more.` : ""}\n\nI've highlighted them on the map for you.`
          : `I couldn't find files matching that. Try asking about:\n- Specific file names or paths\n- "auth", "routes", "risk", "entry points"\n- "What does this project do?"\n- Or describe what you're looking for differently!`,
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
