import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const LANG_BADGE: Record<string, { cls: string; label: string }> = {
  english: { cls: "lang-badge-en", label: "English" },
  hindi: { cls: "lang-badge-hi", label: "Hindi" },
  hinglish: { cls: "lang-badge-hing", label: "Hinglish" },
};

interface Article {
  id: number;
  slug: string;
  title: string;
  meta_description?: string;
  channel: string;
  channel_slug: string;
  channel_avatar?: string;
  thumbnail: string;
  duration: number;
  language: string;
  created_at: string;
}

interface ChannelData {
  channel: string;
  channel_slug: string;
  channel_avatar: string;
  article_count: number;
  articles: Article[];
}

interface PageProps {
  params: Promise<{ channelSlug: string }>;
}

export default async function ChannelProfilePage({ params }: PageProps) {
  const { channelSlug } = await params;

  let data: ChannelData | null = null;
  try {
    const res = await fetch(`${API_BASE}/api/authors/${channelSlug}`, {
      cache: "no-store",
    });
    if (res.ok) {
      data = await res.json();
    }
  } catch {
    // Backend might not be running
  }

  if (!data) {
    return (
      <div className="cp-page">
        <main className="min-h-screen flex flex-col items-center justify-center p-6">
          <h1
            style={{
              fontFamily: "var(--cp-serif)",
              fontSize: "32px",
              fontWeight: 900,
            }}
          >
            Author not found
          </h1>
          <Link
            href="/"
            className="back-btn"
            style={{ width: "auto", border: "none", marginTop: "16px" }}
          >
            Back to articles
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="cp-page">
      <Link href="/" className="back-btn">
        &larr; All Articles
      </Link>

      <div className="au-page">
        {/* ─── Author header ─── */}
        <div className="au-header">
          <div className="au-avatar-wrap">
            {data.channel_avatar ? (
              <img
                src={data.channel_avatar}
                alt={data.channel}
                className="au-avatar-img"
              />
            ) : (
              <div className="au-avatar-fallback">
                {data.channel.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="au-info">
            <h1 className="au-name">{data.channel}</h1>
            <p className="au-role">YouTube Creator</p>
            <p className="au-bio">
              {data.channel} publishes crypto insights and market analysis on
              YouTube. Browse all {data.article_count} article
              {data.article_count !== 1 ? "s" : ""} converted from their channel.
            </p>
            <div className="au-stats-row">
              <div className="au-stat">
                <span className="au-stat-num">{data.article_count}</span>
                <span className="au-stat-label">Articles</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section header ─── */}
        <div className="au-section-head">
          <h2>Articles by {data.channel}</h2>
          <span className="au-article-count">
            {data.article_count} article{data.article_count !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ─── Articles list ─── */}
        <div className="au-articles">
          {data.articles.map((a) => {
            const li = LANG_BADGE[a.language] || {
              cls: "",
              label: a.language,
            };
            const date = new Date(a.created_at + "Z");
            const formattedDate = date.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            const readingTime = a.meta_description
              ? Math.max(1, Math.round(a.meta_description.length / 30))
              : 3;

            return (
              <Link
                key={a.slug}
                href={`/articles/${a.channel_slug || "author"}/${a.slug}`}
                className="au-article-card"
              >
                <div className="au-article-img">
                  <img src={a.thumbnail} alt={a.title} />
                </div>
                <div className="au-article-body">
                  <div className="au-article-meta-top">
                    <span className={`cd-lang-pill ${li.cls}`}>
                      {li.label}
                    </span>
                    <span className="au-article-date">{formattedDate}</span>
                  </div>
                  <h3 className="au-article-title">{a.title}</h3>
                  {a.meta_description && (
                    <p className="au-article-desc">{a.meta_description}</p>
                  )}
                  <div className="au-article-foot">
                    <span className="au-article-duration">
                      {Math.floor(a.duration / 60)}:
                      {String(a.duration % 60).padStart(2, "0")} video
                    </span>
                    <span className="au-article-read">Read article &rarr;</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="cd-footer">
        <div className="cd-footer-brand">
          CryptoDaily<span style={{ color: "var(--cp-accent)" }}>Ink</span>
        </div>
        <p className="cd-footer-sub">Powered by YouTube to Article</p>
      </footer>
    </div>
  );
}
