"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const LANG_BADGE: Record<string, { cls: string; label: string }> = {
  english: { cls: "lang-badge-en", label: "English" },
  hindi: { cls: "lang-badge-hi", label: "Hindi" },
  hinglish: { cls: "lang-badge-hing", label: "Hinglish" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "english", label: "English Articles", icon: "🌐" },
  { key: "hindi", label: "Hindi Articles", icon: "🇮🇳" },
  { key: "hinglish", label: "Hinglish Articles", icon: "🔀" },
];

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

/* ── helpers ────────────────────────────────────────────── */

function formatTime(dateStr: string): string {
  const d = new Date(dateStr + "Z");
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr + "Z").getTime();
  const hrs = Math.floor(diff / 3.6e6);
  if (hrs < 1) return "Just now";
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr + "Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function langOf(a: Article) {
  return LANG_BADGE[a.language] || { cls: "", label: a.language };
}

/* ── page ───────────────────────────────────────────────── */

export default function HomePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/articles`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => setArticles(d.articles || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/tags`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => setTags((d.tags || []).slice(0, 15)))
      .catch(() => setTags([]));
  }, []);

  const filtered =
    filter === "all" ? articles : articles.filter((a) => a.language === filter);
  const featured = filtered[0] || null;
  const sideList = filtered.slice(1, 5);
  const gridArticles = filtered.slice(5);

  const langCounts = articles.reduce<Record<string, number>>((acc, a) => {
    acc[a.language] = (acc[a.language] || 0) + 1;
    return acc;
  }, {});

  /* loading */
  if (loading) {
    return (
      <div className="cp-page">
        <div className="cd-empty">
          <p className="cd-empty-title">Loading articles&hellip;</p>
        </div>
      </div>
    );
  }

  /* empty */
  if (articles.length === 0) {
    return (
      <div className="cp-page">
        <div className="cd-empty">
          <p className="cd-empty-title">No articles published yet</p>
          <Link href="/app" className="cd-empty-cta">
            Convert your first video &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      <div className="cd-layout">
        {/* ─── LEFT SIDEBAR ─── */}
        <aside className="cd-left">
          <div className="cd-left-head">
            <span className="cd-left-icon">&#9673;</span>
            <h3>Latest Articles</h3>
          </div>

          <div className="cd-left-date">Today</div>

          {articles.slice(0, 8).map((a) => {
            const li = langOf(a);
            return (
              <Link
                key={a.slug}
                href={`/articles/${a.slug}`}
                className="cd-latest-item"
              >
                <span className="cd-latest-time">
                  {formatTime(a.created_at)}
                </span>
                <div className="cd-latest-badges">
                  <span className={`cd-lang-pill ${li.cls}`}>{li.label}</span>
                </div>
                <h4 className="cd-latest-title">{a.title}</h4>
                <p className="cd-latest-channel">
                  By{" "}
                  <Link
                    href={`/@${a.channel_slug}`}
                    className="cd-author-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.channel}
                  </Link>
                </p>
              </Link>
            );
          })}
        </aside>

        {/* ─── MAIN CONTENT ─── */}
        <main className="cd-main">
          {/* header + pills */}
          <div className="cd-feat-head">
            <h2>Featured Stories</h2>
            <span className="cd-view-all">View all stories &rarr;</span>
          </div>

          <div className="cd-pills">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`cd-pill${filter === f.key ? " cd-pill-on" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.icon && <span className="cd-pill-icon">{f.icon}</span>}
                {f.label}
              </button>
            ))}
          </div>

          {/* hero + side list */}
          {featured && (
            <div className="cd-hero-row">
              <Link
                href={`/articles/${featured.slug}`}
                className="cd-hero-card"
              >
                <div className="cd-hero-img">
                  <img src={featured.thumbnail} alt={featured.title} />
                </div>
                <span className="cd-hero-cat">
                  {langOf(featured).label}
                </span>
                <h3 className="cd-hero-title">{featured.title}</h3>
                <span className="cd-hero-time">
                  {timeAgo(featured.created_at)}
                </span>
              </Link>

              {sideList.length > 0 && (
                <div className="cd-side-list">
                  {sideList.map((a) => (
                    <Link
                      key={a.slug}
                      href={`/articles/${a.slug}`}
                      className="cd-side-item"
                    >
                      <span className="cd-side-cat">
                        {langOf(a).label}
                      </span>
                      <h4 className="cd-side-title">{a.title}</h4>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* article grid */}
          {gridArticles.length > 0 && (
            <div className="cd-grid">
              {gridArticles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/articles/${a.slug}`}
                  className="cd-grid-card"
                >
                  <div className="cd-grid-img">
                    <img src={a.thumbnail} alt={a.title} />
                  </div>
                  <h4 className="cd-grid-title">{a.title}</h4>
                  <p className="cd-grid-meta">
                    <Link
                      href={`/@${a.channel_slug}`}
                      className="cd-author-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {a.channel}
                    </Link>
                  </p>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* ─── RIGHT SIDEBAR ─── */}
        <aside className="cd-right">
          {/* CTA card */}
          <Link href="/app" className="cd-cta-card">
            <div className="cd-cta-plus">+</div>
            <h4>Convert New Video</h4>
            <p>Turn any YouTube video into an SEO-optimized article</p>
          </Link>

          {/* Stats */}
          <div className="cd-stats">
            <h4 className="cd-stats-head">Article Stats</h4>
            <div className="cd-stat-row">
              <span>Total Articles</span>
              <strong>{articles.length}</strong>
            </div>
            {Object.entries(langCounts).map(([lang, count]) => (
              <div key={lang} className="cd-stat-row">
                <span className={`cd-lang-pill ${LANG_BADGE[lang]?.cls || ""}`}>
                  {LANG_BADGE[lang]?.label || lang}
                </span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>

          {/* Popular Tags */}
          {tags.length > 0 && (
            <div className="cd-tags-section">
              <h4 className="cd-stats-head">Popular Tags</h4>
              <div className="cd-tags-cloud">
                {tags.map((t) => (
                  <Link
                    key={t.name}
                    href={`/tags/${t.name}`}
                    className="cd-tag-pill"
                  >
                    {t.name} <span className="cd-tag-count">{t.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Latest highlight */}
          {articles[0] && (
            <div className="cd-highlight">
              <h4 className="cd-stats-head">Latest Published</h4>
              <Link
                href={`/articles/${articles[0].slug}`}
                className="cd-highlight-card"
              >
                <img src={articles[0].thumbnail} alt={articles[0].title} />
                <h5>{articles[0].title}</h5>
              </Link>
            </div>
          )}
        </aside>
      </div>

      {/* footer */}
      <footer className="cd-footer">
        <div className="cd-footer-brand">
          Chain<span style={{ color: "var(--cp-accent)" }}>.</span>Pulse
        </div>
        <p className="cd-footer-sub">Powered by YouTube to Article</p>
      </footer>
    </div>
  );
}
