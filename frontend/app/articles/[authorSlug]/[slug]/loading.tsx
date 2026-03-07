export default function ArticleLoading() {
  return (
    <div className="cp-page">
      <div className="back-btn">&larr; All Articles</div>
      <div className="ap-layout">
        <article className="ap-article">
          <div style={{ height: 16, width: 80, background: "#e5e5e5", borderRadius: 3, marginBottom: 20 }} />
          <div style={{ height: 40, width: "80%", background: "#e5e5e5", borderRadius: 4, marginBottom: 12 }} />
          <div style={{ height: 40, width: "60%", background: "#e5e5e5", borderRadius: 4, marginBottom: 20 }} />
          <div style={{ height: 14, width: 200, background: "#f0f0f0", borderRadius: 3, marginBottom: 8 }} />
          <div style={{ height: 12, width: 250, background: "#f0f0f0", borderRadius: 3, marginBottom: 20 }} />
          <hr className="ap-divider" />
          <div style={{ aspectRatio: "16/9", width: "100%", background: "#f0f0f0", borderRadius: 4, marginBottom: 32 }} />
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 14, width: `${90 - i * 5}%`, background: "#f5f5f5", borderRadius: 3, marginBottom: 12 }} />
          ))}
        </article>
      </div>
    </div>
  );
}
