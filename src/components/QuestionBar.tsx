"use client";

import { useState, useRef } from "react";
import { CitySchema, OnboardingSummary, QuestionResponse } from "@/types/city";

interface QuestionBarProps {
  city: CitySchema;
  onboarding: OnboardingSummary | null;
  onAnswer: (response: QuestionResponse) => void;
}

export default function QuestionBar({
  city,
  onboarding,
  onAnswer,
}: QuestionBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setLastAnswer(null);

    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, city, onboarding }),
      });

      const data: QuestionResponse = await res.json();
      setLastAnswer(data.answer);
      onAnswer(data);
    } catch {
      setLastAnswer("Failed to process question. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[600px]">
      {/* Answer bubble */}
      {lastAnswer && (
        <div className="mb-3 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm shadow-xl">
          <div className="text-gray-300 text-sm whitespace-pre-wrap">
            {lastAnswer}
          </div>
          <button
            onClick={() => setLastAnswer(null)}
            className="text-gray-500 text-xs mt-2 hover:text-gray-300"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Ask anything... (e.g., "Where is the auth logic?")'
          className="w-full bg-gray-900/95 border border-gray-700 rounded-xl px-5 py-3.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 backdrop-blur-sm shadow-xl"
        />
        <button
          type="submit"
          disabled={loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm transition"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>
    </div>
  );
}
