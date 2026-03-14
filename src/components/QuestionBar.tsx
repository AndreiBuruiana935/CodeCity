"use client";

import { useEffect, useRef, useState } from "react";
import { CitySchema, OnboardingSummary, QuestionResponse } from "@/types/city";

interface QuestionBarProps {
  city: CitySchema;
  onboarding: OnboardingSummary | null;
  onAnswer: (response: QuestionResponse) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export default function QuestionBar({
  city,
  onboarding,
  onAnswer,
}: QuestionBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Ask about architecture, risk hotspots, entry points, or specific files.",
      timestamp: Date.now(),
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      text: query.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery("");

    setLoading(true);

    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage.text, city, onboarding }),
      });

      const data: QuestionResponse = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          timestamp: Date.now(),
        },
      ]);
      onAnswer(data);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Failed to process question. Please try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <aside className="fixed left-6 top-20 bottom-6 z-30 w-[360px] max-w-[calc(100vw-3rem)] rounded-2xl border border-cyan-300/20 bg-slate-950/80 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-700/50 px-4 py-3">
          <div className="text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
            Code City Assistant
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {city.city.name}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((message, index) => (
            <div
              key={`${message.timestamp}-${index}`}
              className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                message.role === "user"
                  ? "ml-6 border border-cyan-300/30 bg-cyan-400/10 text-cyan-50"
                  : "mr-6 border border-slate-700/60 bg-slate-900/75 text-slate-200"
              }`}
            >
              <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase opacity-70">
                {message.role === "user" ? "You" : "Code City"}
              </div>
              <div className="whitespace-pre-wrap">{message.text}</div>
            </div>
          ))}
          {loading && (
            <div className="mr-6 rounded-xl border border-slate-700/60 bg-slate-900/75 px-3 py-2 text-sm text-slate-300">
              <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase opacity-70">
                Code City
              </div>
              Thinking...
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-slate-700/50 px-4 py-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Ask about auth, risk, routes, or "where to start"'
              className="w-full rounded-xl border border-slate-600/50 bg-slate-900/75 px-4 py-3 pr-20 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
