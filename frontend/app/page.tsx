"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SENTIMENT_BADGE: Record<string, { cls: string; label: string }> = {
  bullish: { cls: "sentiment-bullish", label: "Bullish" },
  neutral: { cls: "sentiment-neutral", label: "Neutral" },
  bearish: { cls: "sentiment-bearish", label: "Bearish" },
};

const CATEGORY_TABS = [
  { key: "all", label: "All", tags: [] as string[] },
  {
    key: "crypto",
    label: "Crypto News",
    tags: ["bitcoin", "ethereum", "defi", "altcoin", "crypto", "blockchain", "web3", "nft", "solana", "xrp", "binance", "coinbase"],
  },
  {
    key: "forex",
    label: "Forex News",
    tags: ["forex", "currency", "dollar", "eur", "gbp", "fx", "yen", "pound"],
  },
  {
    key: "usmarket",
    label: "US Market News",
    tags: ["stocks", "market", "nasdaq", "sp500", "fed", "economy", "wall-street", "dow", "treasury", "inflation"],
  },
  {
    key: "press",
    label: "Press Release",
    tags: ["press-release", "announcement", "partnership", "launch", "funding", "acquisition"],
  },
];

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
}

interface Article {
  id: number;
  slug: string;
  title: string;
  channel: string;
  channel_slug: string;
  thumbnail: string;
  duration: number;
  language: string;
  sentiment?: string;
  sentiment_score?: number;
  tags?: string;
  created_at: string;
}

/* ── helpers ────────────────────────────────────────────── */

function articleUrl(a: Article): string {
  return `/articles/${a.channel_slug || "author"}/${a.slug}`;
}

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

function sentimentOf(a: Article) {
  const s = a.sentiment || "neutral";
  return SENTIMENT_BADGE[s] || SENTIMENT_BADGE.neutral;
}

function SentimentMeter({ sentiment, score }: { sentiment: string; score: number }) {
  const s = sentiment || "neutral";
  const info = SENTIMENT_BADGE[s] || SENTIMENT_BADGE.neutral;
  return (
    <span className={`cd-sentiment-badge ${info.cls}`}>
      {info.label}
      <span className="cd-sentiment-meter">
        <span
          className={`cd-sentiment-fill cd-sentiment-fill-${s}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="cd-sentiment-score">{score}</span>
    </span>
  );
}

/* ── page ───────────────────────────────────────────────── */

export default function HomePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/articles`)
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => setArticles(d.articles || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/tags`)
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => setTags((d.tags || []).slice(0, 15)))
      .catch(() => setTags([]));

    fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false"
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Coin[]) => setCoins(data))
      .catch(() => setCoins([]));
  }, []);

  /* ── filtering ── */
  const activeTab = CATEGORY_TABS.find((t) => t.key === category) || CATEGORY_TABS[0];
  let filtered = articles;

  if (activeTab.tags.length > 0) {
    filtered = filtered.filter((a) => {
      const articleTags = (a.tags || "").toLowerCase().split(",").map((t) => t.trim());
      return activeTab.tags.some((catTag) =>
        articleTags.some((aTag) => aTag.includes(catTag))
      );
    });
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((a) => a.title.toLowerCase().includes(q));
  }

  const featured = filtered[0] || null;
  const sideList = filtered.slice(1, 5);
  const gridArticles = filtered.slice(5);

  const sentimentCounts = articles.reduce<Record<string, number>>((acc, a) => {
    const s = a.sentiment || "neutral";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="cp-page">
        {/* Show ticker even while articles load */}
        {coins.length > 0 && (
          <div className="cd-ticker-bar">
            <div className="cd-ticker-track">
              {[...coins, ...coins].map((c, i) => {
                const up = c.price_change_percentage_24h >= 0;
                return (
                  <div key={`${c.id}-${i}`} className="cd-ticker-card">
                    <div className="cd-ticker-card-row1">
                      <img src={c.image} alt={c.name} className="cd-ticker-logo" />
                      <span className="cd-ticker-name">{c.name}</span>
                      <span className="cd-ticker-symbol">{c.symbol.toUpperCase()}</span>
                    </div>
                    <div className="cd-ticker-card-row2">
                      <span className="cd-ticker-price">
                        ${c.current_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className={`cd-ticker-change ${up ? "cd-ticker-up" : "cd-ticker-down"}`}>
                        {up ? "\u25B2" : "\u25BC"} {Math.abs(c.price_change_percentage_24h).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="cd-skeleton-wrap">
          <div className="cd-skeleton-bar" style={{ width: "40%", height: 24, marginBottom: 16 }} />
          <div className="cd-skeleton-bar" style={{ width: "100%", height: 280, borderRadius: 6, marginBottom: 16 }} />
          <div className="cd-skeleton-row">
            {[1,2,3].map(i => (
              <div key={i} className="cd-skeleton-card">
                <div className="cd-skeleton-bar" style={{ width: "100%", height: 140, borderRadius: 4, marginBottom: 10 }} />
                <div className="cd-skeleton-bar" style={{ width: "80%", height: 16, marginBottom: 6 }} />
                <div className="cd-skeleton-bar" style={{ width: "50%", height: 12 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
      {/* ─── CRYPTO TICKER ─── */}
      {coins.length > 0 && (
        <div className="cd-ticker-bar">
          <div className="cd-ticker-track">
            {[...coins, ...coins].map((c, i) => {
              const up = c.price_change_percentage_24h >= 0;
              return (
                <div key={`${c.id}-${i}`} className="cd-ticker-card">
                  <div className="cd-ticker-card-row1">
                    <img src={c.image} alt={c.name} className="cd-ticker-logo" />
                    <span className="cd-ticker-name">{c.name}</span>
                    <span className="cd-ticker-symbol">{c.symbol.toUpperCase()}</span>
                  </div>
                  <div className="cd-ticker-card-row2">
                    <span className="cd-ticker-price">
                      ${c.current_price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`cd-ticker-change ${up ? "cd-ticker-up" : "cd-ticker-down"}`}>
                      {up ? "\u25B2" : "\u25BC"} {Math.abs(c.price_change_percentage_24h).toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="cd-layout">
        {/* ─── LEFT SIDEBAR ─── */}
        <aside className="cd-left">
          <div className="cd-left-head">
            <span className="cd-left-icon">&#9673;</span>
            <h3>Latest Articles</h3>
          </div>

          <div className="cd-left-date">Today</div>

          {articles.slice(0, 8).map((a) => (
            <Link
              key={a.slug}
              href={articleUrl(a)}
              className="cd-latest-item"
            >
              <span className="cd-latest-time">
                {formatTime(a.created_at)}
              </span>
              <div className="cd-latest-badges">
                <SentimentMeter sentiment={a.sentiment || "neutral"} score={a.sentiment_score ?? 50} />
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
          ))}
        </aside>

        {/* ─── MAIN CONTENT ─── */}
        <main className="cd-main">
          <div className="cd-feat-head">
            <h2>Featured Stories</h2>
            <span className="cd-view-all">View all stories &rarr;</span>
          </div>

          <div className="cd-category-tabs">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`cd-cat-tab${category === tab.key ? " cd-cat-tab-active" : ""}`}
                onClick={() => setCategory(tab.key)}
              >
                {tab.label}
              </button>
            ))}
            <button
              className={`cd-cat-tab cd-search-btn${showSearch ? " cd-cat-tab-active" : ""}`}
              onClick={() => {
                setShowSearch(!showSearch);
                if (showSearch) setSearchQuery("");
              }}
              title="Search articles"
            >
              &#128269;
            </button>
          </div>

          {showSearch && (
            <div className="cd-search-wrap">
              <input
                type="text"
                className="cd-search-input"
                placeholder="Search articles by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {featured && (
            <div className="cd-hero-row">
              <Link
                href={articleUrl(featured)}
                className="cd-hero-card"
              >
                <div className="cd-hero-img">
                  <img src={featured.thumbnail} alt={featured.title} />
                </div>
                <SentimentMeter sentiment={featured.sentiment || "neutral"} score={featured.sentiment_score ?? 50} />
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
                      href={articleUrl(a)}
                      className="cd-side-item"
                    >
                      <SentimentMeter sentiment={a.sentiment || "neutral"} score={a.sentiment_score ?? 50} />
                      <h4 className="cd-side-title">{a.title}</h4>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {gridArticles.length > 0 && (
            <div className="cd-grid">
              {gridArticles.map((a) => (
                <Link
                  key={a.slug}
                  href={articleUrl(a)}
                  className="cd-grid-card"
                >
                  <div className="cd-grid-img">
                    <img src={a.thumbnail} alt={a.title} />
                  </div>
                  <SentimentMeter sentiment={a.sentiment || "neutral"} score={a.sentiment_score ?? 50} />
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
          <div className="cd-stats">
            <h4 className="cd-stats-head">Article Stats</h4>
            <div className="cd-stat-row">
              <span>Total Articles</span>
              <strong>{articles.length}</strong>
            </div>
            {Object.entries(sentimentCounts).map(([sentiment, count]) => (
              <div key={sentiment} className="cd-stat-row">
                <span className={`cd-sentiment-pill ${SENTIMENT_BADGE[sentiment]?.cls || ""}`}>
                  {SENTIMENT_BADGE[sentiment]?.label || sentiment}
                </span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>

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

          {articles[0] && (
            <div className="cd-highlight">
              <h4 className="cd-stats-head">Latest Published</h4>
              <Link
                href={articleUrl(articles[0])}
                className="cd-highlight-card"
              >
                <img src={articles[0].thumbnail} alt={articles[0].title} />
                <h5>{articles[0].title}</h5>
              </Link>
            </div>
          )}
        </aside>
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
