import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rewrite /@channel-slug to /channel/channel-slug
  if (pathname.startsWith("/@")) {
    const channelSlug = pathname.slice(2);
    const url = request.nextUrl.clone();
    url.pathname = `/channel/${channelSlug}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
