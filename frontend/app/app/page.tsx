"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UrlForm from "../../components/UrlForm";
import ArticleView from "../../components/ArticleView";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const APP_PASSWORD = "Devashishone23@";

interface Metadata {
  title: string;
  channel: string;
  channel_avatar: string;
  thumbnail: string;
  duration: number;
}

interface ConvertResult {
  metadata: Metadata;
  transcript: string;
  title: string;
  meta_description: string;
  article: string;
  tags: string;
  language: string;
}

const STEPS = [
  "Fetching video metadata...",
  "Transcribing with Gemini 2.5 Pro...",
  "Generating SEO article...",
  "Creating AI thumbnail...",
];

export default function ConverterPage() {
  const router = useRouter();
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("app_authed") === "1") setAuthed(true);
  }, []);

  // Silent 6-hour cookie health check
  useEffect(() => {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const lastCheck = localStorage.getItem("cookie_check_time");
    const now = Date.now();
    if (!lastCheck || now - parseInt(lastCheck, 10) > SIX_HOURS) {
      fetch(`${API_BASE}/api/cookies/health`)
        .then(() => localStorage.setItem("cookie_check_time", String(now)))
        .catch(() => {});
    }
  }, []);

  async function handleSubmit(url: string, language: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    setStep(0);
    setCurrentUrl(url);

    const stepTimer = setInterval(() => {
      setStep((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 8000);

    try {
      const res = await fetch(`${API_BASE}/api/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, language }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Conversion failed");
      }

      const data: ConvertResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      clearInterval(stepTimer);
      setLoading(false);
    }
  }

  async function handlePublish() {
    if (!result) return;
    setPublishing(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          meta_description: result.meta_description,
          channel: result.metadata.channel,
          channel_avatar: result.metadata.channel_avatar || "",
          thumbnail: result.metadata.thumbnail,
          duration: result.metadata.duration,
          youtube_url: currentUrl,
          language: result.language,
          transcript: result.transcript,
          article: result.article,
          tags: result.tags || "",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Failed to publish");
      }

      const data = await res.json();
      router.push(`/articles/${data.channel_slug || "author"}/${data.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <h1 style={{ fontFamily: "var(--cp-serif)", fontSize: 28, fontWeight: 900, color: "#111" }}>
            Access Required
          </h1>
          <p style={{ color: "#6b7280", marginTop: 8, fontSize: 14 }}>
            Enter the password to continue
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pwInput === APP_PASSWORD) {
              sessionStorage.setItem("app_authed", "1");
              setAuthed(true);
              setPwError(false);
            } else {
              setPwError(true);
            }
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340 }}
        >
          <input
            type="password"
            placeholder="Password"
            value={pwInput}
            onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
            style={{
              padding: "10px 14px",
              border: `1px solid ${pwError ? "#ef4444" : "#d1d5db"}`,
              borderRadius: 6,
              fontSize: 14,
              outline: "none",
            }}
            autoFocus
          />
          {pwError && (
            <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>Incorrect password</p>
          )}
          <button
            type="submit"
            style={{
              padding: "10px 0",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Unlock
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center mb-2">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
          YouTube to Article
        </h1>
        <p className="text-gray-500 mt-2">
          Turn any YouTube video into an SEO-optimized blog article
        </p>
      </div>

      <UrlForm onSubmit={handleSubmit} loading={loading} />

      {/* Progress indicator */}
      {loading && (
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-3">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                {i < step ? (
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i === step ? (
                  <svg className="animate-spin h-5 w-5 text-red-500 flex-shrink-0" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                )}
                <span className={`text-sm ${i <= step ? "text-gray-900" : "text-gray-400"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="w-full max-w-2xl bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-red-600 text-sm">
          {error}
        </div>
      )}

      {result && (
        <ArticleView
          metadata={result.metadata}
          transcript={result.transcript}
          articleTitle={result.title}
          metaDescription={result.meta_description}
          article={result.article}
          language={result.language}
          onPublish={handlePublish}
          publishing={publishing}
        />
      )}
    </main>
  );
}
