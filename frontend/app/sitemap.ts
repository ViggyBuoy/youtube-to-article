import type { MetadataRoute } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cryptodailyink.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
  ];

  // Fetch all articles for sitemap
  try {
    const res = await fetch(`${API_BASE}/api/articles?limit=500`, {
      next: { revalidate: 3600 }, // Cache sitemap for 1 hour
    });
    if (res.ok) {
      const data = await res.json();
      const articles = data.articles || [];
      for (const article of articles) {
        const authorSlug = article.channel_slug || "author";
        entries.push({
          url: `${SITE_URL}/articles/${authorSlug}/${article.slug}`,
          lastModified: article.created_at
            ? new Date(article.created_at + "Z")
            : new Date(),
          changeFrequency: "weekly",
          priority: 0.8,
        });

        // Add author profile pages (deduplicate later by Set)
        entries.push({
          url: `${SITE_URL}/@${authorSlug}`,
          changeFrequency: "daily",
          priority: 0.6,
        });

        // Add tag pages from article tags
        const tags = (article.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean);
        for (const tag of tags) {
          entries.push({
            url: `${SITE_URL}/tags/${encodeURIComponent(tag)}`,
            changeFrequency: "daily",
            priority: 0.5,
          });
        }
      }
    }
  } catch {
    // API unavailable, return static entries only
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
