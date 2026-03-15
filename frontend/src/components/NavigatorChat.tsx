"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { CitySchema, OnboardingSummary } from "@/types/city";
import { useAppContext } from '@/components/AppContext';
import { compressRepoContext } from "@/lib/navigator-prompt";

type NavigatorChatProps = {
	city: CitySchema;
	onboarding: OnboardingSummary | null;
};

type Message = {
	role: "user" | "assistant";
	content: string;
};

const QUICK_PROMPTS = [
	"Explain the architecture in English",
	"Explica la arquitectura en espanol",
	"Explique l'architecture en francais",
	"Spune-mi unde este cel mai mare risc tehnic",
];

export default function NavigatorChat({ city, onboarding }: NavigatorChatProps) {
	const { analystReport } = useAppContext();
	const [messages, setMessages] = useState<Message[]>([
		{
			role: "assistant",
			content:
				"I am your Navigator AI. Ask in English, Espanol, Francais, Deutsch, Romana, Italiano, or Portugues.",
		},
	]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages, loading]);

	const canSend = input.trim().length > 0 && !loading;
	const repoSummary = compressRepoContext(city, onboarding, analystReport as never);

	const postMessage = useCallback(async (content: string) => {
		const userMsg: Message = { role: "user", content };
		setMessages((prev) => [...prev, userMsg]);
		setInput("");
		setLoading(true);
		setError(null);

		try {
			const history = [...messages, userMsg].slice(-10);

			const res = await fetch("/api/navigate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message: content,
					city,
					onboarding,
					history,
				}),
			});

			const raw = (await res.json()) as { answer?: string; error?: string };
			if (!res.ok || !raw.answer) {
				throw new Error(raw.error || "Navigator failed to answer");
			}

			setMessages((prev) => [...prev, { role: "assistant", content: raw.answer as string }]);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Unable to reach navigator service";
			setError(message);
			setMessages((prev) => [
				...prev,
				{
					role: "assistant",
					content:
						"Navigator is temporarily unavailable. Please verify backend server and FEATHERLESS_API_KEY, then retry.",
				},
			]);
		} finally {
			setLoading(false);
			inputRef.current?.focus();
		}
	}, [messages, city, onboarding]);

	const placeholder = useMemo(() => {
		const topEntry = city.city.entryPoints[0];
		if (topEntry) return `Ask about ${topEntry} or any module in your language...`;
		return "Ask architecture questions in your language...";
	}, [city]);

	return (
		<div className="flex w-[38%] shrink-0 flex-col">
			<div className="flex items-center gap-2.5 border-b border-slate-700/40 px-5 py-3">
				<svg className="h-5 w-5 text-cyan-400/80" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
				</svg>
				<span className="text-sm font-semibold tracking-wide text-slate-200">Navigator AI</span>
				<span className="ml-auto text-[11px] text-slate-500">Multilingual</span>
			</div>

			<div className="border-b border-slate-700/30 px-5 py-2">
				<div className="flex flex-wrap gap-2">
					{QUICK_PROMPTS.map((prompt) => (
						<button
							key={prompt}
							type="button"
							onClick={() => postMessage(prompt)}
							disabled={loading}
							className="rounded-full border border-slate-700/60 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100 disabled:opacity-50"
						>
							{prompt}
						</button>
					))}
				</div>
			</div>

			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/40">
				{messages.map((msg, i) => (
					<div key={`${msg.role}-${i}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
						<div
							className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
								msg.role === "user"
									? "bg-cyan-500/15 text-cyan-100"
									: "bg-slate-800/60 text-slate-300"
							}`}
						>
							<p className="whitespace-pre-wrap">{msg.content}</p>
						</div>
					</div>
				))}

				{loading && (
					<div className="flex justify-start">
						<div className="flex items-center gap-2.5 rounded-2xl bg-slate-800/60 px-4 py-3 text-sm text-slate-400">
							<span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/40 border-t-cyan-200" />
							Navigator is thinking...
						</div>
					</div>
				)}
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (!canSend) return;
					void postMessage(input.trim());
				}}
				className="flex items-center gap-3 border-t border-slate-700/40 px-5 py-3"
			>
				<input
					ref={inputRef}
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={placeholder}
					className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20"
				/>
				<button
					type="submit"
					disabled={!canSend}
					className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:opacity-40"
				>
					Send
				</button>
			</form>

			{error && <p className="px-5 pb-3 text-xs text-amber-300">{error}</p>}
		</div>
	);
}
