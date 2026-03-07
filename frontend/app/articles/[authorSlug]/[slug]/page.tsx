import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Metadata } from "next";
import { LocalDate, SentimentGaugeClient } from "./client-parts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/
  );
  return match ? match[1] : null;
}

const SENTIMENT_BADGE: Record<string, { cls: string; label: string }> = {
  bullish: { cls: "sentiment-bullish", label: "Bullish" },
  neutral: { cls: "sentiment-neutral", label: "Neutral" },
  bearish: { cls: "sentiment-bearish", label: "Bearish" },
};

interface PageProps {
  params: Promise<{ authorSlug: string; slug: string }>;
}

/* ── OG Meta Tags for social sharing ── */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, authorSlug } = await params;
  try {
    const res = await fetch(`${API_BASE}/api/articles/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const article = await res.json();
      const articleUrl = `${SITE_URL}/articles/${authorSlug}/${slug}`;
      // Use /api/og-image endpoint for social previews (base64 data URLs don't work for OG)
      const ogImageUrl = article.thumbnail?.startsWith("data:")
        ? `${API_BASE}/api/og-image/${slug}`
        : article.thumbnail;
      return {
        title: `${article.title} | CryptoDailyInk`,
        description: article.meta_description || article.title,
        openGraph: {
          title: article.title,
          description: article.meta_description || article.title,
          url: articleUrl,
          siteName: "CryptoDailyInk",
          images: ogImageUrl
            ? [
                {
                  url: ogImageUrl,
                  width: 1200,
                  height: 630,
                  alt: article.title,
                },
              ]
            : [],
          type: "article",
          authors: [article.channel],
          publishedTime: article.created_at ? new Date(article.created_at + "Z").toISOString() : undefined,
        },
        twitter: {
          card: "summary_large_image",
          title: article.title,
          description: article.meta_description || article.title,
          images: ogImageUrl ? [ogImageUrl] : [],
        },
      };
    }
  } catch {
    // Fallback
  }
  return {
    title: "Article | CryptoDailyInk",
    description: "Crypto, Forex & Market News — Powered by AI",
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug, authorSlug } = await params;

  let article = null;
  try {
    const res = await fetch(`${API_BASE}/api/articles/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      article = await res.json();
    }
  } catch {
    // Backend might not be running
  }

  if (!article) {
    return (
      <div className="cp-page">
        <main className="min-h-screen flex flex-col items-center justify-center p-6">
          <h1 style={{ fontFamily: "var(--cp-serif)", fontSize: "32px", fontWeight: 900 }}>
            Article not found
          </h1>
          <Link href="/" className="back-btn" style={{ width: "auto", border: "none", marginTop: "16px" }}>
            Back to articles
          </Link>
        </main>
      </div>
    );
  }

  const sentiment = article.sentiment || "neutral";
  const sentimentScore = article.sentiment_score ?? 50;
  const sentimentInfo = SENTIMENT_BADGE[sentiment] || SENTIMENT_BADGE.neutral;
  const readingTime = Math.max(1, Math.round(article.article.split(/\s+/).length / 200));
  const articlePath = `/articles/${authorSlug}/${article.slug}`;

  return (
    <div className="cp-page">
      <Link href="/" className="back-btn">
        &larr; All Articles
      </Link>

      <div className="ap-layout">
        <article className="ap-article">
          <div className="ap-topbar">
            <SentimentGaugeClient sentiment={sentiment} score={sentimentScore} />
            <a
              className="ap-share-link"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`${SITE_URL}${articlePath}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              &#8599; Share
            </a>
          </div>

          <h1 className="ap-title">{article.title}</h1>

          {article.meta_description && (
            <p className="ap-lead">{article.meta_description}</p>
          )}

          <div className="ap-byline">
            <span>By <Link href={`/@${article.channel_slug || ""}`}><strong>{article.channel}</strong></Link></span>
          </div>

          <div className="ap-date">
            <LocalDate dateStr={article.created_at} /> &middot; {readingTime} min read
          </div>

          <hr className="ap-divider" />

          <div className="ap-featured-img">
            <img src={article.thumbnail} alt={article.title} />
          </div>

          <div className="article-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="table-wrap">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {article.article}
            </ReactMarkdown>
          </div>

          {article.duration > 0 && article.youtube_url && (() => {
            const videoId = extractYouTubeId(article.youtube_url);
            return videoId ? (
              <div className="ap-video-section">
                <div className="ap-video-wrapper">
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title={article.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : null;
          })()}

          <div className="article-tags">
            <span className={`tag ${sentimentInfo.cls}`}>{sentimentInfo.label}</span>
            {(article.tags || "")
              .split(",")
              .filter(Boolean)
              .map((tag: string) => (
                <Link
                  key={tag.trim()}
                  href={`/tags/${tag.trim()}`}
                  className="tag tag-link"
                >
                  {tag.trim()}
                </Link>
              ))}
          </div>
        </article>

        <aside className="ap-sidebar">
          <div className="ap-details-card">
            <div className="ap-details-title">Article Details</div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Author</span>
              <Link href={`/@${article.channel_slug || ""}`} className="ap-detail-value cd-author-link">
                {article.channel}
              </Link>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Sentiment</span>
              <span className={`cd-sentiment-pill ${sentimentInfo.cls}`}>
                {sentimentInfo.label} ({sentimentScore})
              </span>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Duration</span>
              <span className="ap-detail-value">
                {Math.floor(article.duration / 60)}:{String(article.duration % 60).padStart(2, "0")}
              </span>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Published</span>
              <span className="ap-detail-value"><LocalDate dateStr={article.created_at} /></span>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Reading Time</span>
              <span className="ap-detail-value">{readingTime} min</span>
            </div>
          </div>

          <div className="ap-details-card">
            <div className="ap-details-title">Share</div>
            <div className="share-btns">
              <a
                className="share-btn"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`${SITE_URL}${articlePath}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                Twitter
              </a>
              <a
                className="share-btn"
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${SITE_URL}${articlePath}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                LinkedIn
              </a>
            </div>
          </div>

          <Link href="/" className="cd-cta-card">
            <h4>Browse All Articles</h4>
            <p>Read more published stories</p>
          </Link>
        </aside>
      </div>

      <footer className="cd-footer">
        <div className="cd-footer-brand">
          CryptoDaily<span style={{ color: "var(--cp-accent)" }}>Ink</span>
        </div>
      </footer>
    </div>
  );
}
