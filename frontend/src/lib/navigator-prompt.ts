import type { CitySchema, OnboardingSummary } from "@/types/city";

export type NavigatorLanguage = "en" | "es" | "fr" | "de" | "ro" | "it" | "pt";

const LANGUAGE_MARKERS: Record<Exclude<NavigatorLanguage, "en">, string[]> = {
	es: ["hola", "gracias", "arquitectura", "explica", "archivo", "riesgo", "dependencias", "que", "como", "para", "con"],
	fr: ["bonjour", "merci", "architecture", "explique", "fichier", "risque", "dependances", "avec", "pour", "dans", "est"],
	de: ["hallo", "danke", "architektur", "erklar", "datei", "risiko", "abhangigkeit", "und", "mit", "fuer", "der"],
	ro: ["salut", "multumesc", "arhitectura", "explica", "fisier", "risc", "dependente", "pentru", "care", "este", "intr"],
	it: ["ciao", "grazie", "architettura", "spiega", "file", "rischio", "dipendenze", "con", "per", "che", "come"],
	pt: ["ola", "obrigado", "arquitetura", "explique", "arquivo", "risco", "dependencias", "com", "para", "que", "como"],
};

const LANGUAGE_DIACRITICS: Record<Exclude<NavigatorLanguage, "en">, RegExp> = {
	es: /[\u00F1\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00BF\u00A1]/i,
	fr: /[\u00E0\u00E2\u00E6\u00E7\u00E8\u00E9\u00EA\u00EB\u00EE\u00EF\u00F4\u0153\u00F9\u00FB\u00FC\u00FF]/i,
	de: /[\u00E4\u00F6\u00FC\u00DF]/i,
	ro: /[\u0103\u00E2\u00EE\u0219\u021B\u0218\u021A]/i,
	it: /[\u00E0\u00E8\u00E9\u00EC\u00F2\u00F9]/i,
	pt: /[\u00E3\u00E7\u00E1\u00E2\u00EA\u00ED\u00F3\u00F4\u00FA\u00E0\u00F5]/i,
};

function tokenize(input: string): string[] {
	return input
		.toLowerCase()
		.split(/[^a-z\u00C0-\u024F]+/)
		.filter((token) => token.length >= 2);
}

export function detectNavigatorLanguage(input: string): NavigatorLanguage {
	const text = input.trim();
	if (!text) return "en";

	// Fast path for non-Latin scripts. We still answer in English unless clear support exists.
	if (/[^\u0000-\u024f]/.test(text)) {
		return "en";
	}

	const tokens = tokenize(text);
	const score: Record<Exclude<NavigatorLanguage, "en">, number> = {
		es: 0,
		fr: 0,
		de: 0,
		ro: 0,
		it: 0,
		pt: 0,
	};

	for (const lang of Object.keys(LANGUAGE_MARKERS) as Array<Exclude<NavigatorLanguage, "en">>) {
		if (LANGUAGE_DIACRITICS[lang].test(text)) {
			score[lang] += 3;
		}

		for (const marker of LANGUAGE_MARKERS[lang]) {
			if (tokens.includes(marker)) {
				score[lang] += marker.length <= 3 ? 1 : 2;
			}
		}
	}

	const ranked = (Object.entries(score) as Array<[Exclude<NavigatorLanguage, "en">, number]>)
		.sort((a, b) => b[1] - a[1]);

	const [winner, winnerScore] = ranked[0];
	const secondScore = ranked[1]?.[1] ?? 0;

	if (winnerScore >= 3 && winnerScore - secondScore >= 1) {
		return winner;
	}

	return "en";
}

const LANGUAGE_NAMES: Record<NavigatorLanguage, string> = {
	en: "English",
	es: "Spanish",
	fr: "French",
	de: "German",
	ro: "Romanian",
	it: "Italian",
	pt: "Portuguese",
};

export function buildNavigatorInstruction(language: NavigatorLanguage): string {
	return [
		"You are Navigator, the architecture tour guide for this repository.",
		`Respond in ${LANGUAGE_NAMES[language]}.`,
		"Keep the answer grounded in provided project metadata.",
		"Prioritize architecture flow, responsibilities, risks, and next action.",
		"If the question cannot be answered from context, say what is missing.",
		"Do not invent files or modules.",
	].join(" ");
}

function languageTemplate(language: NavigatorLanguage): {
	opening: string;
	riskLabel: string;
	nextStep: string;
} {
	switch (language) {
		case "es":
			return {
				opening: "Vista rapida de la arquitectura:",
				riskLabel: "Archivos de mayor riesgo",
				nextStep: "Siguiente paso recomendado",
			};
		case "fr":
			return {
				opening: "Vue rapide de l'architecture:",
				riskLabel: "Fichiers les plus risqués",
				nextStep: "Prochaine etape recommandee",
			};
		case "de":
			return {
				opening: "Schneller Architekturuberblick:",
				riskLabel: "Dateien mit hohem Risiko",
				nextStep: "Empfohlener nachster Schritt",
			};
		case "ro":
			return {
				opening: "Rezumat rapid al arhitecturii:",
				riskLabel: "Fisiere cu risc ridicat",
				nextStep: "Pas urmator recomandat",
			};
		case "it":
			return {
				opening: "Panoramica rapida dell'architettura:",
				riskLabel: "File a rischio alto",
				nextStep: "Prossimo passo consigliato",
			};
		case "pt":
			return {
				opening: "Visao rapida da arquitetura:",
				riskLabel: "Arquivos de maior risco",
				nextStep: "Proximo passo recomendado",
			};
		default:
			return {
				opening: "Quick architecture view:",
				riskLabel: "Highest-risk files",
				nextStep: "Recommended next step",
			};
	}
}

export function buildNavigatorFallbackAnswer(
	language: NavigatorLanguage,
	question: string,
	city: CitySchema,
): string {
	const allBuildings = city.city.districts.flatMap((d) => d.buildings);
	const topRisk = [...allBuildings]
		.sort((a, b) => b.riskScore - a.riskScore)
		.slice(0, 3)
		.map((b) => `${b.path} (${b.riskScore}/100)`)
		.join(", ");

	const entryPoints = city.city.entryPoints.length
		? city.city.entryPoints.slice(0, 3).join(", ")
		: "not explicitly detected";

	const t = languageTemplate(language);

	return [
		`${t.opening} ${city.city.name} is a ${city.city.language} codebase using ${city.city.framework} with ${city.city.architecture}.`,
		`It has ${allBuildings.length} files across ${city.city.districts.length} districts, with entry points: ${entryPoints}.`,
		`${t.riskLabel}: ${topRisk || "no risk hotspots were detected in the current snapshot"}.`,
		`${t.nextStep}: ask about one specific module or file path so I can provide dependency-level guidance.`,
		language === "en" ? `Question received: ${question}` : "",
	]
		.filter(Boolean)
		.join(" ");
}

export function compressRepoContext(
	city: CitySchema | null,
	onboarding: OnboardingSummary | null,
	analystReport?: {
		summary?: string;
		roles?: Array<{ file: string; role: string }>;
		risks?: Array<{ file: string; reason: string; severity: string }>;
		readingList?: Array<{ priority: number; file: string; reason: string }>;
		tour?: Array<{ step: number; file: string; label: string; description: string }>;
	} | null
): string {
	if (!city) return 'No repository analysed yet.';

	const c = city.city;
	const allBuildings = c.districts.flatMap(d => d.buildings);
	const totalFiles = allBuildings.length;
	const entryFiles = allBuildings.filter(b => b.entryPoint).map(b => b.path);
	const secureFiles = allBuildings.filter(b => b.securitySensitive).map(b => b.path);
	const topRisk = [...allBuildings]
		.sort((a, b) => b.riskScore - a.riskScore)
		.slice(0, 8)
		.map(b => `${b.path} (risk: ${b.riskScore})`);

	const districtNames = c.districts
		.slice(0, 20)
		.map(d => d.name)
		.join(', ');

	const lines: string[] = [
		`Repo: ${c.name}`,
		`Language: ${c.language} | Framework: ${c.framework} | Architecture: ${c.architecture}`,
		`Files: ${totalFiles} across ${c.districts.length} modules`,
		`Modules: ${districtNames}${c.districts.length > 20 ? ` ... and ${c.districts.length - 20} more` : ''}`,
		entryFiles.length > 0
			? `Entry points: ${entryFiles.slice(0, 5).join(', ')}`
			: 'No clear entry points detected.',
		secureFiles.length > 0
			? `Security-sensitive files: ${secureFiles.slice(0, 5).join(', ')}`
			: 'No security-sensitive files flagged.',
		`Top risk files: ${topRisk.join(' | ')}`,
		onboarding?.plainEnglish
			? `Summary: ${onboarding.plainEnglish}`
			: '',
		analystReport?.summary
			? `AI summary: ${analystReport.summary}`
			: '',
		analystReport?.roles && analystReport.roles.length > 0
			? `Roles: ${analystReport.roles.slice(0, 10).map(r => `${r.file} → ${r.role}`).join(' | ')}`
			: '',
		analystReport?.risks && analystReport.risks.length > 0
			? `Risks: ${analystReport.risks.slice(0, 5).map(r => `${r.file} (${r.severity}): ${r.reason}`).join(' | ')}`
			: '',
		analystReport?.readingList && analystReport.readingList.length > 0
			? `Reading list: ${analystReport.readingList.slice(0, 5).map(r => `#${r.priority} ${r.file} — ${r.reason}`).join(' | ')}`
			: '',
		analystReport?.tour && analystReport.tour.length > 0
			? `Tour: ${analystReport.tour.map(t => `Step ${t.step}: ${t.file} (${t.label})`).join(' | ')}`
			: '',
	];

	return lines.filter(Boolean).join('\n');
}
