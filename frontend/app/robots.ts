import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cryptodailyink.com";

/**
 * Dynamic robots.txt — allows social crawlers to access OG images
 * while blocking private routes and AI training bots.
 *
 * Key points:
 * - /api/og-image/ is explicitly ALLOWED so Twitter, Facebook, LinkedIn,
 *   Telegram, Discord, Slack, WhatsApp, and iMessage can fetch thumbnails.
 * - /api/ (everything else) and /app (converter) are blocked.
 * - Meta AI training bots and Applebot-Extended are blocked separately.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Block Meta AI training crawlers (preserve Facebook/WhatsApp link previews)
      { userAgent: "meta-externalagent", disallow: ["/"] },
      { userAgent: "FacebookBot", disallow: ["/"] },
      { userAgent: "Meta-ExternalFetcher", disallow: ["/"] },
      // Block Apple AI training (preserve iMessage/Siri previews via Applebot)
      { userAgent: "Applebot-Extended", disallow: ["/"] },
      // All other crawlers: allow site + OG images, block private routes
      {
        userAgent: "*",
        allow: ["/", "/api/og-image/"],
        disallow: ["/app", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
