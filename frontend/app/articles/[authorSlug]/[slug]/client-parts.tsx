"use client";

const SENTIMENT_BADGE: Record<string, { cls: string; label: string }> = {
  bullish: { cls: "sentiment-bullish", label: "Bullish" },
  neutral: { cls: "sentiment-neutral", label: "Neutral" },
  bearish: { cls: "sentiment-bearish", label: "Bearish" },
};

export function LocalDate({ dateStr }: { dateStr: string }) {
  const d = new Date(dateStr + "Z");
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return <>{date}, {time}</>;
}

export function SentimentGaugeClient({
  sentiment,
  score,
}: {
  sentiment: string;
  score: number;
}) {
  const s = sentiment || "neutral";
  const info = SENTIMENT_BADGE[s] || SENTIMENT_BADGE.neutral;

  let gv = 50;
  if (s === "bearish") gv = (100 - score) / 2;
  else if (s === "bullish") gv = 50 + score / 2;

  const angle = (gv / 100) * 180 - 90;

  return (
    <span className={`cd-sentiment-badge ${info.cls}`}>
      {info.label}
      <svg
        width="28"
        height="16"
        viewBox="0 0 36 22"
        className="cd-gauge-svg"
      >
        <path
          d="M 4 20 A 14 14 0 0 1 11 7.88"
          fill="none"
          stroke="#ef4444"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M 11 7.88 A 14 14 0 0 1 25 7.88"
          fill="none"
          stroke="#d1d5db"
          strokeWidth="3"
        />
        <path
          d="M 25 7.88 A 14 14 0 0 1 32 20"
          fill="none"
          stroke="#22c55e"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1="18"
          y1="20"
          x2="18"
          y2="7"
          stroke="#1f2937"
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: "18px 20px",
            transition: "transform 0.6s ease",
          }}
        />
        <circle cx="18" cy="20" r="2" fill="#374151" />
      </svg>
    </span>
  );
}
