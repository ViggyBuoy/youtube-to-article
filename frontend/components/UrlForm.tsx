"use client";

import { useState, FormEvent } from "react";
import LanguageSelect from "./LanguageSelect";

interface UrlFormProps {
  onSubmit: (url: string, language: string) => void;
  loading: boolean;
}

export default function UrlForm({ onSubmit, loading }: UrlFormProps) {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("english");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) onSubmit(trimmed, language);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl flex flex-col gap-4">
      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube URL..."
          className="flex-1 rounded-xl bg-white/10 border border-white/20 px-5 py-3.5 text-white placeholder-white/40 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed px-7 py-3.5 font-semibold text-white transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Converting...
            </span>
          ) : (
            "Convert"
          )}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-white/40 text-sm">Language:</span>
        <LanguageSelect value={language} onChange={setLanguage} disabled={loading} />
      </div>
    </form>
  );
}
