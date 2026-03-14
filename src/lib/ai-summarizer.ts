import { Building, CitySchema, OnboardingSummary } from "@/types/city";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type FeatherlessResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const FEATHERLESS_BASE_URL =
  process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1";
const FEATHERLESS_API_KEY = process.env.FEATHERLESS_API_KEY;
const FEATHERLESS_ANALYSIS_MODEL =
  process.env.FEATHERLESS_ANALYSIS_MODEL || "gpt-4o-mini";
const FEATHERLESS_CHAT_MODEL =
  process.env.FEATHERLESS_CHAT_MODEL || "gpt-4o-mini";

function isFeatherlessConfigured(): boolean {
  return Boolean(FEATHERLESS_API_KEY);
}

async function featherlessChatCompletion(
  messages: ChatMessage[],
  model: string,
  temperature = 0.2,
  maxTokens = 1200
): Promise<string> {
  if (!isFeatherlessConfigured()) {
    throw new Error("Featherless API key is missing");
  }

  const res = await fetch(`${FEATHERLESS_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FEATHERLESS_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Featherless request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as FeatherlessResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Featherless returned an empty completion");
  }

  return content;
}

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];

  return text;
}

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

  if (!isFeatherlessConfigured()) {
    for (const b of buildings) {
      summaries.set(b.path, fallbackSummaryFromPrompt(b));
    }
    return summaries;
  }

  const compactBuildings = buildings.slice(0, 150).map((b) => ({
    id: b.id,
    path: b.path,
    entryPoint: b.entryPoint,
    securitySensitive: b.securitySensitive,
    riskScore: b.riskScore,
    complexity: b.complexity,
    dependencyCount: b.dependencyCount,
    linesOfCode: b.linesOfCode,
    functions: b.functions.slice(0, 8).map((f) => f.name),
  }));

  try {
    const content = await featherlessChatCompletion(
      [
        {
          role: "system",
          content:
            "You are a senior software architect. Focus heavily on infrastructure, code topology, coupling, runtime flow, and maintainability risks. Return only valid JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create concise but detailed infrastructure-focused summaries for each file.",
            format: {
              summaries: [
                {
                  path: "string",
                  summary:
                    "2-4 sentences: architectural role, call/dependency context, and critical risk or ownership hints",
                },
              ],
            },
            repoName,
            language,
            buildings: compactBuildings,
            constraints: [
              "Max 450 characters per summary",
              "Explain where this file sits in architecture, not just what it does",
              "If security or entry flow applies, mention it explicitly",
            ],
          }),
        },
      ],
      FEATHERLESS_ANALYSIS_MODEL,
      0.2,
      2400
    );

    const parsed = JSON.parse(extractJsonBlock(content)) as {
      summaries?: Array<{ path?: string; summary?: string }>;
    };

    for (const item of parsed.summaries || []) {
      const path = item.path?.trim();
      const summary = item.summary?.trim();
      if (path && summary) {
        summaries.set(path, summary);
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
  const topRisk = [...allBuildings]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 30)
    .map((b) => ({
      id: b.id,
      path: b.path,
      riskScore: b.riskScore,
      complexity: b.complexity,
      dependencyCount: b.dependencyCount,
      summary: b.aiSummary,
      warnings: b.aiWarnings,
      entryPoint: b.entryPoint,
    }));

  if (isFeatherlessConfigured()) {
    try {
      const content = await featherlessChatCompletion(
        [
          {
            role: "system",
            content:
              "You are a codebase navigator assistant. Answer based on provided project metadata. Prefer architecture and infrastructure explanations. Return only valid JSON.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Answer the user's question about this repository.",
              outputFormat: {
                answer:
                  "string with concrete explanation and reasoning tied to architecture",
                highlightedBuildings: ["array of building ids to highlight"],
                cameraFlyTo: "building id or null",
                confidence: "0..1 number",
              },
              question,
              city: {
                name: city.city.name,
                language: city.city.language,
                framework: city.city.framework,
                architecture: city.city.architecture,
                districtNames: city.city.districts.map((d) => d.name),
                entryPoints: city.city.entryPoints,
              },
              onboarding,
              candidateBuildings: topRisk,
              constraints: [
                "If unsure, say uncertainty explicitly",
                "Never invent files not in candidateBuildings",
                "Prioritize structural explanation over generic tips",
              ],
            }),
          },
        ],
        FEATHERLESS_CHAT_MODEL,
        0.25,
        1800
      );

      const parsed = JSON.parse(extractJsonBlock(content)) as {
        answer?: string;
        highlightedBuildings?: string[];
        cameraFlyTo?: string | null;
        confidence?: number;
      };

      if (parsed.answer && typeof parsed.answer === "string") {
        const validIds = new Set(allBuildings.map((b) => b.id));
        const highlighted = (parsed.highlightedBuildings || []).filter((id) =>
          validIds.has(id)
        );
        const flyTo = parsed.cameraFlyTo && validIds.has(parsed.cameraFlyTo)
          ? parsed.cameraFlyTo
          : highlighted[0] || null;

        return {
          answer: parsed.answer,
          highlightedBuildings: highlighted.slice(0, 10),
          cameraFlyTo: flyTo,
          confidence:
            typeof parsed.confidence === "number"
              ? Math.max(0, Math.min(1, parsed.confidence))
              : 0.75,
        };
      }
    } catch {
      // Fall through to local answer logic
    }
  }

  const q = question.toLowerCase();
  const keywordMatches = allBuildings.filter((b) => {
    const text = `${b.path} ${b.filename} ${b.aiSummary} ${b.colorLabel}`.toLowerCase();
    return q
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .some((w) => text.includes(w));
  });
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
  const topRisk = [...buildings]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 6)
    .map((b) => ({
      path: b.path,
      riskScore: b.riskScore,
      entryPoint: b.entryPoint,
      dependencyCount: b.dependencyCount,
      complexity: b.complexity,
    }));

  if (isFeatherlessConfigured()) {
    try {
      const content = await featherlessChatCompletion(
        [
          {
            role: "system",
            content:
              "You are a principal engineer writing onboarding notes. Focus on infrastructure and architecture first, then pragmatic next steps.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Write one concise onboarding paragraph.",
              constraints: [
                "4-6 sentences",
                "Mention architecture, key modules, and where to start reading",
                "Mention at least one risk hotspot",
              ],
              city: {
                name: city.city.name,
                language: city.city.language,
                framework: city.city.framework,
                architecture: city.city.architecture,
                districts: city.city.districts.map((d) => d.name),
                entryPoints: city.city.entryPoints,
              },
              hotspots: topRisk,
            }),
          },
        ],
        FEATHERLESS_ANALYSIS_MODEL,
        0.25,
        700
      );

      if (content.trim()) {
        return content.trim();
      }
    } catch {
      // Fall through to deterministic onboarding text
    }
  }

  const hotspots = topRisk.map((b) => b.path).join(", ");
  return `This is a ${city.city.language} ${city.city.architecture} project using ${city.city.framework} with ${buildings.length} files across ${city.city.districts.length} modules. Start with entry points and top-risk files to understand execution flow quickly. Current hotspots: ${hotspots || "none"}.`;
}
