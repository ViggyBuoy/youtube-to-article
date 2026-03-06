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
  const [authors, setAuthors] = useState<Author[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [authorsRes, articlesRes] = await Promise.all([
        fetch(`${API_BASE}/api/authors`),
        fetch(`${API_BASE}/api/admin/articles`, {
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
    // Fetch full article with body
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
                        <Link href={`/articles/${a.slug}`}>{a.title}</Link>
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
      </div>
    </div>
  );
}
