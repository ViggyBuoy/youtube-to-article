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
  channel: string;
  channel_slug: string;
  thumbnail: string;
  duration: number;
  language: string;
  created_at: string;
}

interface ChannelData {
  channel: string;
  channel_slug: string;
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

      <div className="ch-profile">
        {/* Channel header */}
        <div className="ch-header">
          <div className="ch-avatar">
            {data.channel.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="ch-name">{data.channel}</h1>
            <p className="ch-meta">
              {data.article_count} article
              {data.article_count !== 1 ? "s" : ""} published
            </p>
          </div>
        </div>

        {/* Articles grid */}
        <div className="ch-grid">
          {data.articles.map((a) => {
            const li = LANG_BADGE[a.language] || {
              cls: "",
              label: a.language,
            };
            return (
              <Link
                key={a.slug}
                href={`/articles/${a.slug}`}
                className="cd-grid-card"
              >
                <div className="cd-grid-img">
                  <img src={a.thumbnail} alt={a.title} />
                </div>
                <div className="ch-card-badges">
                  <span className={`cd-lang-pill ${li.cls}`}>{li.label}</span>
                </div>
                <h4 className="cd-grid-title">{a.title}</h4>
                <p className="cd-grid-meta">
                  {new Date(a.created_at + "Z").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </Link>
            );
          })}
        </div>
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
