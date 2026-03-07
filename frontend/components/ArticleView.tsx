"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface Metadata {
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
}

interface ArticleViewProps {
  metadata: Metadata;
  transcript: string;
  articleTitle: string;
  metaDescription: string;
  article: string;
  language: string;
  onPublish: () => void;
  publishing: boolean;
}

type Tab = "article" | "transcript";

const LANG_LABELS: Record<string, string> = {
  english: "English",
  hindi: "Hindi",
  hinglish: "Hinglish",
};

export default function ArticleView({
  metadata,
  transcript,
  articleTitle,
  metaDescription,
  article,
  language,
  onPublish,
  publishing,
}: ArticleViewProps) {
  const [tab, setTab] = useState<Tab>("article");
  const [copied, setCopied] = useState(false);

  const content = tab === "article" ? article : transcript;

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full max-w-3xl">
      {/* Video info header */}
      <div className="flex gap-4 mb-6">
        <img
          src={metadata.thumbnail}
          alt={metadata.title}
          className="w-24 h-16 rounded-lg object-cover flex-shrink-0"
        />
        <div className="min-w-0">
          <h2 className="text-gray-900 font-semibold leading-snug line-clamp-2">
            {metadata.title}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-gray-500 text-sm">{metadata.channel}</p>
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
              {LANG_LABELS[language] || language}
            </span>
          </div>
        </div>
      </div>

      {/* Generated article title + meta */}
      <div className="mb-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
        <div className="text-gray-400 text-xs font-mono uppercase tracking-wider mb-1">
          Generated Headline
        </div>
        <h3 className="text-gray-900 text-lg font-bold leading-snug mb-2">
          {articleTitle}
        </h3>
        {metaDescription && (
          <>
            <div className="text-gray-400 text-xs font-mono uppercase tracking-wider mb-1">
              Meta Description
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              {metaDescription}
            </p>
          </>
        )}
      </div>

      {/* Tabs + actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab("article")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "article"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Article Body
          </button>
          <button
            onClick={() => setTab("transcript")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "transcript"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Transcript
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-sm transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2} />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth={2} />
                </svg>
                Copy
              </>
            )}
          </button>

          <button
            onClick={onPublish}
            disabled={publishing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {publishing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Publishing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v12m0 0l-4-4m4 4l4-4" />
                </svg>
                Publish
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-none leading-relaxed text-gray-700">
        {tab === "article" ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{article}</ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{transcript}</div>
        )}
      </div>
    </div>
  );
}
