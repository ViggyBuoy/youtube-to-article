import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cryptodailyink.com";

/**
 * Dynamic robots.txt
 *
 * - All crawlers (search engines, social bots, AI training) are welcome.
 * - /api/og-image/ is explicitly ALLOWED so social crawlers can fetch thumbnails.
 * - /api/ (everything else) and /app (converter) are blocked.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og-image/"],
        disallow: ["/app", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
