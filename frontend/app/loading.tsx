export default function Loading() {
  return (
    <div className="cp-page">
      <div className="cd-skeleton-wrap">
        <div className="cd-skeleton-bar" style={{ width: "35%", height: 22, marginBottom: 16 }} />
        <div className="cd-skeleton-bar" style={{ width: "100%", height: 260, borderRadius: 6, marginBottom: 20 }} />
        <div className="cd-skeleton-row">
          {[1, 2, 3].map((i) => (
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
