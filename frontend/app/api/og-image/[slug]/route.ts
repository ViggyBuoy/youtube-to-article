import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Proxy article thumbnails through Vercel's edge so social crawlers
 * always get a fast response (no Render cold-start delay).
 * Caches for 7 days at the CDN edge, 24h in browser.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const backendUrl = `${API_BASE}/api/og-image/${slug}`;
    const res = await fetch(backendUrl, {
      next: { revalidate: 86400 }, // ISR: revalidate every 24h
    });

    if (!res.ok) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const imageBuffer = await res.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error(`[og-image proxy] Failed for slug=${slug}:`, error);
    return new NextResponse("Failed to fetch image", { status: 502 });
  }
}
