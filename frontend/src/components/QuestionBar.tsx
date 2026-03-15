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
  const [minimized, setMinimized] = useState(true);
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
    if (!minimized) {
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [minimized]);

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
      // Build conversation history for multi-turn context
      const history = [...messages, userMessage]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }));

      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMessage.text,
          city,
          onboarding,
          messages: history,
        }),
      });

      const data: QuestionResponse = await res.json();

      if (data.error) {
        throw new Error(data.error as string);
      }

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

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 left-6 z-30 rounded-xl border border-cyan-300/35 bg-slate-950/90 px-5 py-3 text-base font-semibold text-cyan-100 shadow-[0_18px_38px_rgba(0,0,0,0.45)] backdrop-blur-xl transition hover:border-cyan-200/70"
      >
        Open Chat
      </button>
    );
  }

  return (
    <aside className="fixed bottom-6 left-6 top-20 z-30 w-105 max-w-[calc(100vw-3rem)] rounded-2xl border border-cyan-300/20 bg-slate-950/80 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-slate-700/50 px-4 py-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">
              CodeAtlas Assistant
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {city.city.name}
            </div>
          </div>
          <button
            onClick={() => setMinimized(true)}
            className="rounded-md border border-slate-600/50 px-2 py-1 text-sm font-semibold leading-none text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            aria-label="Minimize chat"
          >
            ↓
          </button>
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
                {message.role === "user" ? "You" : "CodeAtlas"}
              </div>
              <div className="whitespace-pre-wrap">{message.text}</div>
            </div>
          ))}
          {loading && (
            <div className="mr-6 rounded-xl border border-slate-700/60 bg-slate-900/75 px-3 py-2 text-sm text-slate-300">
              <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase opacity-70">
                CodeAtlas
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
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-linear-to-r from-cyan-400 to-blue-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
