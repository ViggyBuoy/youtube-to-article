import Link from "next/link";
import ReactMarkdown from "react-markdown";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/
  );
  return match ? match[1] : null;
}

const LANG_BADGE: Record<string, { class: string; label: string }> = {
  english: { class: "lang-badge-en", label: "English" },
  hindi: { class: "lang-badge-hi", label: "Hindi" },
  hinglish: { class: "lang-badge-hing", label: "Hinglish" },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;

  let article = null;
  try {
    const res = await fetch(`${API_BASE}/api/articles/${slug}`, {
      cache: "no-store",
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

  const langInfo = LANG_BADGE[article.language] || { class: "", label: article.language };
  const publishedDate = new Date(article.created_at + "Z");
  const formattedDate = publishedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = publishedDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const readingTime = Math.max(1, Math.round(article.article.split(/\s+/).length / 200));

  return (
    <div className="cp-page">
      {/* Top nav bar */}
      <Link href="/" className="back-btn">
        &larr; All Articles
      </Link>

      {/* Article layout */}
      <div className="ap-layout">
        {/* ─── Main article column ─── */}
        <article className="ap-article">
          {/* Category + Share */}
          <div className="ap-topbar">
            <span className="ap-category">{langInfo.label}</span>
            <a
              className="ap-share-link"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`${SITE_URL}/articles/${article.slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              &#8599; Share
            </a>
          </div>

          {/* Title */}
          <h1 className="ap-title">{article.title}</h1>

          {/* Meta description / lead */}
          {article.meta_description && (
            <p className="ap-lead">{article.meta_description}</p>
          )}

          {/* Byline */}
          <div className="ap-byline">
            <span>By <Link href={`/@${article.channel_slug || ""}`}><strong>{article.channel}</strong></Link></span>
          </div>

          {/* Date */}
          <div className="ap-date">
            {formattedDate}, {formattedTime} &middot; {readingTime} min read
          </div>

          {/* Separator */}
          <hr className="ap-divider" />

          {/* Featured image */}
          <div className="ap-featured-img">
            <img src={article.thumbnail} alt={article.title} />
          </div>

          {/* Article body */}
          <div className="article-text">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {article.article}
            </ReactMarkdown>
          </div>

          {/* YouTube Video Embed — only for YouTube articles (duration > 0) */}
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

          {/* Tags */}
          <div className="article-tags">
            <span className="tag">{article.language}</span>
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

        {/* ─── Right sidebar ─── */}
        <aside className="ap-sidebar">
          {/* Article details card */}
          <div className="ap-details-card">
            <div className="ap-details-title">Article Details</div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Channel</span>
              <Link href={`/@${article.channel_slug || ""}`} className="ap-detail-value cd-author-link">
                {article.channel}
              </Link>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Language</span>
              <span className={`cd-lang-pill ${langInfo.class}`}>
                {langInfo.label}
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
              <span className="ap-detail-value">{formattedDate}</span>
            </div>
            <div className="ap-detail-row">
              <span className="ap-detail-label">Reading Time</span>
              <span className="ap-detail-value">{readingTime} min</span>
            </div>
          </div>

          {/* Share buttons */}
          <div className="ap-details-card">
            <div className="ap-details-title">Share</div>
            <div className="share-btns">
              <a
                className="share-btn"
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`${SITE_URL}/articles/${article.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                Twitter
              </a>
              <a
                className="share-btn"
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${SITE_URL}/articles/${article.slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                LinkedIn
              </a>
            </div>
          </div>

          {/* More articles CTA */}
          <Link href="/" className="cd-cta-card">
            <h4>Browse All Articles</h4>
            <p>Read more published stories</p>
          </Link>
        </aside>
      </div>

      {/* Footer */}
      <footer className="cd-footer">
        <div className="cd-footer-brand">
          Chain<span style={{ color: "var(--cp-accent)" }}>.</span>Pulse
        </div>
        <p className="cd-footer-sub">Powered by YouTube to Article</p>
      </footer>
    </div>
  );
}
