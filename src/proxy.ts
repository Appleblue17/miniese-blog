/**
 * @file proxy.ts — Next.js 16 proxy middleware.
 *
 * Responsibilities (in order):
 * 1. Auth protection — Protect admin routes using NextAuth
 * 2. Language redirect — Redirect language-less URLs to preferred language
 *
 * Next.js 16 deprecated "middleware.ts" in favor of "proxy.ts".
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORTED_LANGUAGES = ["zh", "en"] as const;
const DEFAULT_LANGUAGE = "zh";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Auth protection ──
  // Protect admin routes using NextAuth
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  // Settings GET is public — non-admin users need appearance settings (body width, colors)
  // for proper page rendering. Only PUT (update) requires admin auth.
  const isSettingsGet = pathname === "/api/admin/settings" && request.method === "GET";
  // Media API GET is public — needed for background image directory expansion on public pages
  const isMediaGet = pathname === "/api/admin/media" && request.method === "GET";

  if ((isAdminPage || isAdminApi) && !isSettingsGet && !isMediaGet) {
    const { auth } = await import("@/auth");
    const session = await auth();

    const isLoggedIn = !!session?.user;
    const roles = (session?.user as { roles?: string[] })?.roles || [];

    if (!isLoggedIn || !roles.includes("admin")) {
      if (isAdminApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Authenticated admin — pass through without language redirect
    return NextResponse.next();
  }

  // ── Language redirect ──

  // Auth pages live at root (/login, /register, etc.), no language prefix needed
  const AUTH_PATHS = ["/login", "/register", "/forgot", "/reset", "/verify", "/settings"];
  if (AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "?"))) {
    return NextResponse.next();
  }

  // Static assets / API — pass through
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/styles") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/images") ||  // Miniese images
    pathname === "/favicon.ico" ||
    pathname === "/rss.xml" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.json"
  ) {
    return NextResponse.next();
  }

  // Already has language prefix — pass through
  const firstSegment = pathname.split("/")[1];
  if (
    firstSegment &&
    SUPPORTED_LANGUAGES.includes(firstSegment as (typeof SUPPORTED_LANGUAGES)[number])
  ) {
    // Auth pages (login, register, etc.) live at root like /login, not /zh/login
    // Rewrite /zh/login → /login, /en/register → /register, etc.
    const AUTH_PATHS = ["/login", "/register", "/forgot", "/reset", "/verify", "/settings"];
    const restPath = "/" + pathname.split("/").slice(2).join("/");
    if (AUTH_PATHS.includes(restPath)) {
      const rewriteUrl = new URL(restPath, request.url);
      return NextResponse.rewrite(rewriteUrl);
    }
    return NextResponse.next();
  }

  // Determine preferred language
  let preferredLang = request.cookies.get("preferred_lang")?.value;
  if (
    !preferredLang ||
    !SUPPORTED_LANGUAGES.includes(preferredLang as (typeof SUPPORTED_LANGUAGES)[number])
  ) {
    const acceptLang = request.headers.get("accept-language") || "";
    preferredLang = acceptLang.startsWith("zh") ? "zh" : DEFAULT_LANGUAGE;
  }

  // Redirect to language-prefixed path
  const newUrl = new URL(`/${preferredLang}${pathname}`, request.url);
  return NextResponse.redirect(newUrl);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
