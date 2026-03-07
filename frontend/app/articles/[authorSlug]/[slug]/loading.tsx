export default function ArticleLoading() {
  return (
    <div className="cp-page">
      <div className="back-btn">&larr; All Articles</div>
      <div className="ap-layout">
        <article className="ap-article">
          {/* Sentiment badge */}
          <div className="cd-skeleton-bar" style={{ height: 20, width: 90, borderRadius: 12, marginBottom: 20 }} />
          {/* Title lines */}
          <div className="cd-skeleton-bar" style={{ height: 36, width: "85%", borderRadius: 4, marginBottom: 10 }} />
          <div className="cd-skeleton-bar" style={{ height: 36, width: "55%", borderRadius: 4, marginBottom: 20 }} />
          {/* Byline */}
          <div className="cd-skeleton-bar" style={{ height: 14, width: 180, borderRadius: 3, marginBottom: 6 }} />
          {/* Date */}
          <div className="cd-skeleton-bar" style={{ height: 12, width: 240, borderRadius: 3, marginBottom: 20 }} />
          <hr className="ap-divider" />
          {/* Featured image */}
          <div className="cd-skeleton-bar" style={{ aspectRatio: "16/9", width: "100%", borderRadius: 6, marginBottom: 32 }} />
          {/* Body text lines */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="cd-skeleton-bar"
              style={{
                height: 14,
                width: `${95 - ((i * 7) % 30)}%`,
                borderRadius: 3,
                marginBottom: i === 4 ? 24 : 10,
              }}
            />
          ))}
        </article>

        <aside className="ap-sidebar">
          <div className="ap-details-card">
            <div className="cd-skeleton-bar" style={{ height: 18, width: "60%", borderRadius: 3, marginBottom: 16 }} />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div className="cd-skeleton-bar" style={{ height: 13, width: 70, borderRadius: 3 }} />
                <div className="cd-skeleton-bar" style={{ height: 13, width: 90, borderRadius: 3 }} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
