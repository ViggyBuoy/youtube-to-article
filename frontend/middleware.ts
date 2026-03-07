import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rewrite /@channel-slug to /channel/channel-slug
  if (pathname.startsWith("/@")) {
    const channelSlug = pathname.slice(2);
    const url = request.nextUrl.clone();
    url.pathname = `/channel/${channelSlug}`;
    return NextResponse.rewrite(url);
  }

  // Redirect old /articles/SLUG to /articles/AUTHOR/SLUG
  // Match /articles/X where X has no further slashes (single segment = old format)
  const oldArticleMatch = pathname.match(/^\/articles\/([^/]+)$/);
  if (oldArticleMatch) {
    const slug = oldArticleMatch[1];
    try {
      const res = await fetch(`${API_BASE}/api/articles/${slug}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const article = await res.json();
        const authorSlug = article.channel_slug || "author";
        const url = request.nextUrl.clone();
        url.pathname = `/articles/${authorSlug}/${slug}`;
        return NextResponse.redirect(url, 301);
      }
    } catch {
      // API unavailable, fall through
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
