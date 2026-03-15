import { NextRequest, NextResponse } from "next/server";
import type { CitySchema, OnboardingSummary } from "@/types/city";
import { aiAnswerQuestion } from "@/lib/ai-summarizer";
import {
	buildNavigatorFallbackAnswer,
	buildNavigatorInstruction,
	detectNavigatorLanguage,
} from "@/lib/navigator-prompt";

type NavigateMessage = {
	role: "user" | "assistant";
	content: string;
};

type NavigateRequest = {
	message: string;
	city: CitySchema;
	onboarding?: OnboardingSummary | null;
	history?: NavigateMessage[];
};

function summarizeCity(city: CitySchema, onboarding?: OnboardingSummary | null): string {
	const allBuildings = city.city.districts.flatMap((d) => d.buildings);
	const topRisk = [...allBuildings]
		.sort((a, b) => b.riskScore - a.riskScore)
		.slice(0, 12)
		.map(
			(b) =>
				`${b.path} | risk:${b.riskScore} | complexity:${b.complexity} | deps:${b.dependencyCount}`
		)
		.join("\n");

	return [
		`Repository: ${city.city.name}`,
		`Language: ${city.city.language}`,
		`Framework: ${city.city.framework}`,
		`Architecture: ${city.city.architecture}`,
		`District count: ${city.city.districts.length}`,
		`File count: ${allBuildings.length}`,
		`Entry points: ${city.city.entryPoints.join(", ") || "none"}`,
		"Top risk files:",
		topRisk,
		"Onboarding summary:",
		onboarding?.plainEnglish || "No onboarding summary available.",
	].join("\n");
}

function inferHighlights(message: string, answer: string, city: CitySchema): string[] {
	const allBuildings = city.city.districts.flatMap((d) => d.buildings);
	const source = `${message} ${answer}`.toLowerCase();
	const terms = source
		.split(/[^a-z0-9_./-]+/)
		.map((w) => w.trim())
		.filter((w) => w.length > 2);

	const matched = allBuildings.filter((b) => {
		const haystack = `${b.path} ${b.filename} ${b.aiSummary}`.toLowerCase();
		return terms.some((term) => haystack.includes(term));
	});

	return matched.slice(0, 10).map((b) => b.id);
}

async function askBackendGuide(
	message: string,
	summary: string,
	languageInstruction: string,
	history: NavigateMessage[]
): Promise<string> {
	const backendUrl =
		process.env.NAVIGATOR_BACKEND_URL || "http://localhost:3001/api/chat-guide";

	const compactHistory = history.slice(-6).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

	const controller = new AbortController();
	const timeoutMs = Number.parseInt(process.env.LLM_TIMEOUT_MS || "60000", 10) || 60000;
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(backendUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: controller.signal,
			body: JSON.stringify({
				userQuery: `${languageInstruction}\n\n${message}`,
				projectSummary: `${summary}\n\nRecent conversation:\n${compactHistory || "none"}`,
			}),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Guide backend failed (${res.status}): ${body}`);
		}

		const raw = (await res.json()) as { answer?: string; error?: string };
		const answer = raw.answer?.trim();
		if (!answer) {
			throw new Error(raw.error || "Guide backend returned an empty answer");
		}

		return answer;
	} finally {
		clearTimeout(timeout);
	}
}

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as NavigateRequest;
		if (!body?.message || !body?.city) {
			return NextResponse.json(
				{ error: "message and city are required" },
				{ status: 400 }
			);
		}

		const language = detectNavigatorLanguage(body.message);
		const languageInstruction = buildNavigatorInstruction(language);
		const summary = summarizeCity(body.city, body.onboarding);
		const history = Array.isArray(body.history) ? body.history : [];

		try {
			const answer = await askBackendGuide(
				body.message,
				summary,
				languageInstruction,
				history
			);

			const highlightedBuildings = inferHighlights(body.message, answer, body.city);

			return NextResponse.json({
				answer,
				highlightedBuildings,
				cameraFlyTo: highlightedBuildings[0] || null,
				confidence: 0.86,
				language,
				source: "guide",
			});
		} catch (guideError: unknown) {
			const guideMessage =
				guideError instanceof Error ? guideError.message : "Unknown guide error";
			console.error("[/api/navigate] guide fallback:", guideMessage);
			const fallbackOnboarding: OnboardingSummary = body.onboarding || {
				plainEnglish: `${body.city.city.language} ${body.city.city.architecture} using ${body.city.city.framework}`,
				guidedTour: [],
				readingList: [],
				riskReport: [],
			};

			const fallback = await aiAnswerQuestion(
				body.message,
				body.city,
				fallbackOnboarding
			);

			// Ensure we still produce a useful architecture answer in the requested language.
			const answer = buildNavigatorFallbackAnswer(language, body.message, body.city);

			return NextResponse.json({
				answer,
				highlightedBuildings: fallback.highlightedBuildings,
				cameraFlyTo: fallback.cameraFlyTo,
				confidence: Math.max(0.55, fallback.confidence),
				language,
				source: "fallback",
			});
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "Navigation failed";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
