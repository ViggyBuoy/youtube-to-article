"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Article {
  id: number;
  slug: string;
  title: string;
  meta_description: string;
  channel: string;
  channel_slug: string;
  channel_avatar: string;
  thumbnail: string;
  duration: number;
  language: string;
  article?: string;
  created_at: string;
}

interface Author {
  channel: string;
  channel_slug: string;
  channel_avatar: string;
  article_count: number;
}

interface Source {
  id: number;
  name: string;
  rss_url: string;
  enabled: boolean;
  published_count: number;
  skipped_count: number;
  total_seen: number;
  created_at: string;
}

/* ── helpers ── */
function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/* ── Admin Panel ── */
export default function AdminPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Check for stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem("admin_token");
    if (stored) setToken(stored);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Login failed");
      }

      const data = await res.json();
      localStorage.setItem("admin_token", data.token);
      setToken(data.token);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("admin_token");
    setToken(null);
  }

  if (!token) {
    return (
      <div className="cp-page">
        <div className="adm-login-page">
          <div className="adm-login-card">
            <div className="adm-login-brand">
              Chain<span style={{ color: "var(--cp-accent)" }}>.</span>Pulse
            </div>
            <h1 className="adm-login-title">Admin Login</h1>
            <p className="adm-login-sub">
              Sign in to manage articles and authors
            </p>

            <form onSubmit={handleLogin} className="adm-login-form">
              <div className="adm-field">
                <label className="adm-label">User ID</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="adm-input"
                  placeholder="Enter your user ID"
                  required
                />
              </div>
              <div className="adm-field">
                <label className="adm-label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="adm-input"
                  placeholder="Enter your password"
                  required
                />
              </div>
              {loginError && <div className="adm-error">{loginError}</div>}
              <button
                type="submit"
                className="adm-login-btn"
                disabled={loginLoading}
              >
                {loginLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <AdminDashboard token={token} onLogout={handleLogout} />;
}

/* ── Dashboard ── */
function AdminDashboard({
  token,
  onLogout,
}: {
  token: string;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"articles" | "sources">("articles");
  const [authors, setAuthors] = useState<Author[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("");

  // Sources state
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [triggerStatus, setTriggerStatus] = useState("");
  const [sourceDeleteConfirm, setSourceDeleteConfirm] = useState<number | null>(null);
  const [scraperLog, setScraperLog] = useState<{time: string; level: string; msg: string}[]>([]);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [authorsRes, articlesRes, sourcesRes] = await Promise.all([
        fetch(`${API_BASE}/api/authors`),
        fetch(`${API_BASE}/api/admin/articles`, {
          headers: authHeaders(token),
        }),
        fetch(`${API_BASE}/api/admin/sources`, {
          headers: authHeaders(token),
        }),
      ]);

      if (authorsRes.ok) {
        const d = await authorsRes.json();
        setAuthors(d.authors || []);
      }
      if (articlesRes.ok) {
        const d = await articlesRes.json();
        setArticles(d.articles || []);
      } else if (articlesRes.status === 401) {
        onLogout();
        return;
      }
      if (sourcesRes.ok) {
        const d = await sourcesRes.json();
        setSources(d.sources || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const filteredArticles = selectedAuthor
    ? articles.filter((a) => a.channel_slug === selectedAuthor)
    : articles;

  const selectedAuthorData = selectedAuthor
    ? authors.find((a) => a.channel_slug === selectedAuthor)
    : null;

  async function handleDelete(slug: string) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/articles/${slug}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (res.ok) {
        setArticles((prev) => prev.filter((a) => a.slug !== slug));
        setDeleteConfirm(null);
        if (editingArticle?.slug === slug) setEditingArticle(null);
      } else if (res.status === 401) {
        onLogout();
      }
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (!editingArticle) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/articles/${editingArticle.slug}`,
        {
          method: "PUT",
          headers: authHeaders(token),
          body: JSON.stringify({
            title: editingArticle.title,
            meta_description: editingArticle.meta_description,
            article: editingArticle.article || "",
          }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setArticles((prev) =>
          prev.map((a) => (a.slug === updated.slug ? { ...a, ...updated } : a))
        );
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 2000);
      } else if (res.status === 401) {
        onLogout();
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus(""), 3000);
      }
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  }

  async function handleEditClick(slug: string) {
    try {
      const res = await fetch(`${API_BASE}/api/articles/${slug}`);
      if (res.ok) {
        const full = await res.json();
        setEditingArticle(full);
      }
    } catch {
      // ignore
    }
  }

  /* ── Source handlers ── */
  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    setAddingSource(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/sources`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ name: newSourceName.trim(), rss_url: newSourceUrl.trim() }),
      });
      if (res.ok) {
        setNewSourceName("");
        setNewSourceUrl("");
        // Reload sources
        const sourcesRes = await fetch(`${API_BASE}/api/admin/sources`, {
          headers: authHeaders(token),
        });
        if (sourcesRes.ok) {
          const d = await sourcesRes.json();
          setSources(d.sources || []);
        }
      } else if (res.status === 401) {
        onLogout();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Failed to add source");
      }
    } catch {
      alert("Failed to add source");
    } finally {
      setAddingSource(false);
    }
  }

  async function handleToggleSource(sourceId: number) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sources/${sourceId}/toggle`, {
        method: "PUT",
        headers: authHeaders(token),
      });
      if (res.ok) {
        setSources((prev) =>
          prev.map((s) => (s.id === sourceId ? { ...s, enabled: !s.enabled } : s))
        );
      }
    } catch {
      // ignore
    }
  }

  async function handleDeleteSource(sourceId: number) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sources/${sourceId}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (res.ok) {
        setSources((prev) => prev.filter((s) => s.id !== sourceId));
        setSourceDeleteConfirm(null);
      }
    } catch {
      // ignore
    }
  }

  async function handleTriggerScrape() {
    setTriggerStatus("running");
    try {
      const res = await fetch(`${API_BASE}/api/admin/sources/trigger`, {
        method: "POST",
        headers: authHeaders(token),
      });
      if (res.ok) {
        setTriggerStatus("started");
        setTimeout(() => setTriggerStatus(""), 4000);
      } else {
        setTriggerStatus("error");
        setTimeout(() => setTriggerStatus(""), 3000);
      }
    } catch {
      setTriggerStatus("error");
      setTimeout(() => setTriggerStatus(""), 3000);
    }
  }

  async function fetchScraperLog() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sources/log`, {
        headers: authHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setScraperLog(data.log || []);
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="cp-page">
        <div className="adm-loading">Loading dashboard...</div>
      </div>
    );
  }

  /* ── Editing view ── */
  if (editingArticle) {
    return (
      <div className="cp-page">
        <div className="adm-wrap">
          <div className="adm-topbar">
            <button
              className="adm-back-btn"
              onClick={() => setEditingArticle(null)}
            >
              &larr; Back to list
            </button>
            <div className="adm-topbar-actions">
              {saveStatus === "saved" && (
                <span className="adm-save-ok">Saved!</span>
              )}
              {saveStatus === "error" && (
                <span className="adm-save-err">Save failed</span>
              )}
              <button
                className="adm-save-btn"
                onClick={handleSave}
                disabled={saveStatus === "saving"}
              >
                {saveStatus === "saving" ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          <div className="adm-edit-page">
            <div className="adm-edit-field">
              <label className="adm-label">Title</label>
              <input
                type="text"
                value={editingArticle.title}
                onChange={(e) =>
                  setEditingArticle({ ...editingArticle, title: e.target.value })
                }
                className="adm-input"
              />
            </div>
            <div className="adm-edit-field">
              <label className="adm-label">Meta Description</label>
              <textarea
                value={editingArticle.meta_description}
                onChange={(e) =>
                  setEditingArticle({
                    ...editingArticle,
                    meta_description: e.target.value,
                  })
                }
                className="adm-textarea"
                rows={3}
              />
            </div>
            <div className="adm-edit-field">
              <label className="adm-label">Article Body (Markdown)</label>
              <textarea
                value={editingArticle.article || ""}
                onChange={(e) =>
                  setEditingArticle({
                    ...editingArticle,
                    article: e.target.value,
                  })
                }
                className="adm-textarea adm-textarea-lg"
                rows={20}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Dashboard view ── */
  return (
    <div className="cp-page">
      <div className="adm-wrap">
        {/* Top bar */}
        <div className="adm-topbar">
          <div className="adm-brand">
            Chain<span style={{ color: "var(--cp-accent)" }}>.</span>Pulse
            <span className="adm-badge">Admin</span>
          </div>
          <button className="adm-logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>

        {/* Tab navigation */}
        <div className="adm-tabs">
          <button
            className={`adm-tab ${activeTab === "articles" ? "adm-tab-active" : ""}`}
            onClick={() => setActiveTab("articles")}
          >
            Articles
          </button>
          <button
            className={`adm-tab ${activeTab === "sources" ? "adm-tab-active" : ""}`}
            onClick={() => setActiveTab("sources")}
          >
            Sources
            {sources.length > 0 && (
              <span className="adm-tab-count">{sources.length}</span>
            )}
          </button>
        </div>

        {/* ── Articles Tab ── */}
        {activeTab === "articles" && (
          <div className="adm-dashboard">
            {/* Authors sidebar */}
            <div className="adm-authors">
              <h3 className="adm-section-title">Authors</h3>
              <button
                className={`adm-author-item ${!selectedAuthor ? "adm-author-active" : ""}`}
                onClick={() => setSelectedAuthor(null)}
              >
                <div className="adm-author-avatar-sm">All</div>
                <div>
                  <div className="adm-author-name">All Authors</div>
                  <div className="adm-author-count">
                    {articles.length} articles
                  </div>
                </div>
              </button>
              {authors.map((a) => (
                <button
                  key={a.channel_slug}
                  className={`adm-author-item ${selectedAuthor === a.channel_slug ? "adm-author-active" : ""}`}
                  onClick={() => setSelectedAuthor(a.channel_slug)}
                >
                  {a.channel_avatar ? (
                    <img
                      src={a.channel_avatar}
                      alt={a.channel}
                      className="adm-author-avatar-img"
                    />
                  ) : (
                    <div className="adm-author-avatar-sm">
                      {a.channel.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="adm-author-name">{a.channel}</div>
                    <div className="adm-author-count">
                      {a.article_count} article
                      {a.article_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Articles list */}
            <div className="adm-articles">
              <div className="adm-articles-head">
                <h3 className="adm-section-title">
                  {selectedAuthorData
                    ? `Articles by ${selectedAuthorData.channel}`
                    : "All Articles"}
                </h3>
                <span className="adm-count-badge">
                  {filteredArticles.length}
                </span>
              </div>

              {filteredArticles.length === 0 ? (
                <div className="adm-empty">No articles found</div>
              ) : (
                <div className="adm-articles-list">
                  {filteredArticles.map((a) => (
                    <div key={a.slug} className="adm-article-row">
                      <div className="adm-article-thumb">
                        <img src={a.thumbnail} alt={a.title} />
                      </div>
                      <div className="adm-article-info">
                        <h4 className="adm-article-title">
                          <Link href={`/articles/${a.channel_slug || "author"}/${a.slug}`}>{a.title}</Link>
                        </h4>
                        <div className="adm-article-meta">
                          <span>{a.channel}</span>
                          <span>&middot;</span>
                          <span>{a.language}</span>
                          <span>&middot;</span>
                          <span>
                            {new Date(a.created_at + "Z").toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" }
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="adm-article-actions">
                        <button
                          className="adm-btn-edit"
                          onClick={() => handleEditClick(a.slug)}
                        >
                          Edit
                        </button>
                        {deleteConfirm === a.slug ? (
                          <div className="adm-delete-confirm">
                            <button
                              className="adm-btn-delete-yes"
                              onClick={() => handleDelete(a.slug)}
                            >
                              Confirm
                            </button>
                            <button
                              className="adm-btn-cancel"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="adm-btn-delete"
                            onClick={() => setDeleteConfirm(a.slug)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Sources Tab ── */}
        {activeTab === "sources" && (
          <div className="adm-sources-panel">
            {/* Add source form */}
            <form onSubmit={handleAddSource} className="adm-source-form">
              <h3 className="adm-section-title">Add RSS Source</h3>
              <div className="adm-source-form-row">
                <input
                  type="text"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="adm-input"
                  placeholder="Source name (e.g. CoinTelegraph)"
                  required
                />
                <input
                  type="url"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  className="adm-input adm-input-url"
                  placeholder="RSS feed URL"
                  required
                />
                <button
                  type="submit"
                  className="adm-source-add-btn"
                  disabled={addingSource}
                >
                  {addingSource ? "Adding..." : "Add Source"}
                </button>
              </div>
            </form>

            {/* Trigger scrape */}
            <div className="adm-source-trigger">
              <button
                className="adm-trigger-btn"
                onClick={handleTriggerScrape}
                disabled={triggerStatus === "running"}
              >
                {triggerStatus === "running"
                  ? "Starting..."
                  : triggerStatus === "started"
                  ? "Scrape cycle started!"
                  : triggerStatus === "error"
                  ? "Failed to trigger"
                  : "Run Scrape Now"}
              </button>
              <button
                className="adm-trigger-btn adm-log-btn"
                onClick={() => { fetchScraperLog(); setShowLog(!showLog); }}
              >
                {showLog ? "Hide Log" : "Scraper Log"}
              </button>
              <span className="adm-trigger-hint">
                Auto-runs every 30 minutes
              </span>
            </div>

            {/* Scraper log */}
            {showLog && (
              <div className="adm-scraper-log">
                <div className="adm-log-header">
                  <h3>Scraper Activity Log</h3>
                  <button className="adm-log-refresh" onClick={fetchScraperLog}>Refresh</button>
                </div>
                {scraperLog.length === 0 ? (
                  <p className="adm-log-empty">No scraper activity yet. Click &quot;Run Scrape Now&quot; to start.</p>
                ) : (
                  <div className="adm-log-entries">
                    {[...scraperLog].reverse().map((entry, i) => (
                      <div key={i} className={`adm-log-entry adm-log-${entry.level}`}>
                        <span className="adm-log-time">
                          {new Date(entry.time).toLocaleTimeString()}
                        </span>
                        <span className="adm-log-msg">{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sources list */}
            <div className="adm-sources-list">
              <h3 className="adm-section-title">
                Configured Sources
                <span className="adm-count-badge">{sources.length}</span>
              </h3>

              {sources.length === 0 ? (
                <div className="adm-empty">
                  No sources added yet. Add an RSS feed above to start auto-scraping.
                </div>
              ) : (
                sources.map((s) => (
                  <div key={s.id} className={`adm-source-row ${!s.enabled ? "adm-source-disabled" : ""}`}>
                    <div className="adm-source-info">
                      <div className="adm-source-name">{s.name}</div>
                      <div className="adm-source-url">{s.rss_url}</div>
                      <div className="adm-source-stats">
                        <span className="adm-source-stat-pub">
                          {s.published_count} published
                        </span>
                        <span className="adm-source-stat-skip">
                          {s.skipped_count} skipped
                        </span>
                        <span className="adm-source-stat-total">
                          {s.total_seen} total processed
                        </span>
                      </div>
                    </div>
                    <div className="adm-source-actions">
                      <button
                        className={`adm-source-toggle ${s.enabled ? "adm-source-toggle-on" : "adm-source-toggle-off"}`}
                        onClick={() => handleToggleSource(s.id)}
                        title={s.enabled ? "Disable" : "Enable"}
                      >
                        {s.enabled ? "ON" : "OFF"}
                      </button>
                      {sourceDeleteConfirm === s.id ? (
                        <div className="adm-delete-confirm">
                          <button
                            className="adm-btn-delete-yes"
                            onClick={() => handleDeleteSource(s.id)}
                          >
                            Confirm
                          </button>
                          <button
                            className="adm-btn-cancel"
                            onClick={() => setSourceDeleteConfirm(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="adm-btn-delete"
                          onClick={() => setSourceDeleteConfirm(s.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
