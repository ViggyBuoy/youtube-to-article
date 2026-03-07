import Link from "next/link";
import type { Metadata } from "next";
import { SentimentGauge, LocalDate } from "../../../components/SentimentGauge";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cryptodailyink.com";

const LANG_BADGE: Record<string, { class: string; label: string }> = {
  english: { class: "lang-badge-en", label: "English" },
  hindi: { class: "lang-badge-hi", label: "Hindi" },
  hinglish: { class: "lang-badge-hing", label: "Hinglish" },
};

interface PageProps {
  params: Promise<{ tag: string }>;
}

/* ── SEO: Dynamic metadata for tag pages ── */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const capitalizedTag = decodedTag.charAt(0).toUpperCase() + decodedTag.slice(1);
  const title = `${capitalizedTag} News & Analysis | CryptoDailyInk`;
  const description = `Latest ${decodedTag} news, market analysis, and on-chain insights on CryptoDailyInk. Stay updated with expert coverage.`;
  return {
    title,
    description,
    alternates: {
      canonical: `/tags/${tag}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/tags/${tag}`,
      siteName: "CryptoDailyInk",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);

  let articles: any[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/tags/${encodeURIComponent(decodedTag)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      articles = data.articles || [];
    }
  } catch {
    // Backend might not be running
  }

  return (
    <div className="cp-page">
      <Link href="/" className="back-btn">
        &larr; All Articles
      </Link>

      <div className="tags-page">
        <h1 className="tags-page-title">
          Tag: <span className="tags-page-highlight">{decodedTag}</span>
        </h1>
        <p className="tags-page-count">
          {articles.length} article{articles.length !== 1 ? "s" : ""}
        </p>

        {articles.length === 0 ? (
          <p className="tags-page-empty">No articles found for this tag.</p>
        ) : (
          <div className="tags-grid">
            {articles.map((a: any) => {
              const langInfo = LANG_BADGE[a.language] || {
                class: "",
                label: a.language,
              };
              return (
                <Link
                  key={a.slug}
                  href={`/articles/${a.channel_slug || "author"}/${a.slug}`}
                  className="cd-grid-card"
                >
                  {a.thumbnail && (
                    <div className="cd-grid-img">
                      <img src={a.thumbnail} alt={a.title} />
                    </div>
                  )}
                  <div className="cd-grid-body">
                    <h3 className="cd-grid-title">{a.title}</h3>
                    <div className="cd-card-meta">
                      <span className="cd-card-author">
                        <Link
                          href={`/@${a.channel_slug || ""}`}
                          className="cd-author-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {a.channel}
                        </Link>
                      </span>
                      {a.created_at && <LocalDate dateStr={a.created_at} />}
                      <SentimentGauge sentiment={a.sentiment || "neutral"} score={a.sentiment_score ?? 50} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <footer className="cd-footer">
        <div className="cd-footer-brand">
          CryptoDaily<span style={{ color: "var(--cp-accent)" }}>Ink</span>
        </div>
      </footer>
    </div>
  );
}
