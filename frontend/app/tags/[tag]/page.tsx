import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const LANG_BADGE: Record<string, { class: string; label: string }> = {
  english: { class: "lang-badge-en", label: "English" },
  hindi: { class: "lang-badge-hi", label: "Hindi" },
  hinglish: { class: "lang-badge-hing", label: "Hinglish" },
};

interface PageProps {
  params: Promise<{ tag: string }>;
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
                    <span className={`cd-lang-pill ${langInfo.class}`}>
                      {langInfo.label}
                    </span>
                    <h3 className="cd-grid-title">{a.title}</h3>
                    <div className="cd-grid-meta">
                      <Link
                        href={`/@${a.channel_slug || ""}`}
                        className="cd-author-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.channel}
                      </Link>
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
        <p className="cd-footer-sub">Powered by YouTube to Article</p>
      </footer>
    </div>
  );
}
