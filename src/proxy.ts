import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LANGUAGES = ["zh", "en"] as const;
const DEFAULT_LANGUAGE = "zh";

function basicAuth(request: NextRequest): NextResponse | null {
  const adminPassword = process.env.ADMIN_PASSWORD;
  // If ADMIN_PASSWORD is not set, allow access without auth (dev mode)
  if (!adminPassword) {
    return null;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = atob(base64);
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return unauthorized();
    const password = decoded.slice(colonIndex + 1);
    if (password !== adminPassword) return unauthorized();
  } catch {
    return unauthorized();
  }

  return null;
}

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin Dashboard"',
    },
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Admin routes — HTTP Basic Auth
  if (pathname.startsWith("/admin")) {
    const authResponse = basicAuth(request);
    if (authResponse) return authResponse;
    return NextResponse.next();
  }

  // 2. Other non-page routes — pass through
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/styles") ||
    pathname.startsWith("/icon") ||
    pathname === "/favicon.ico" ||
    pathname === "/rss.xml" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  // 2. Already has language prefix — pass through
  const firstSegment = pathname.split("/")[1];
  if (
    firstSegment &&
    SUPPORTED_LANGUAGES.includes(firstSegment as (typeof SUPPORTED_LANGUAGES)[number])
  ) {
    return NextResponse.next();
  }

  // 3. Determine preferred language
  let preferredLang = request.cookies.get("preferred_lang")?.value;
  if (
    !preferredLang ||
    !SUPPORTED_LANGUAGES.includes(
      preferredLang as (typeof SUPPORTED_LANGUAGES)[number],
    )
  ) {
    const acceptLang = request.headers.get("accept-language") || "";
    preferredLang = acceptLang.startsWith("zh") ? "zh" : DEFAULT_LANGUAGE;
  }

  // 4. Redirect to language-prefixed path
  const newUrl = new URL(`/${preferredLang}${pathname}`, request.url);
  return NextResponse.redirect(newUrl);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
