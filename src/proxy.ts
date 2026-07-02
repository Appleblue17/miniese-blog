/**
 * @file proxy.ts — Next.js 16 proxy middleware.
 *
 * Responsibilities (in order):
 * 1. Auth protection — Protect admin routes using NextAuth (email is optional,
 *    only users with admin role can access /admin routes)
 * 2. Language redirect — Redirect language-less URLs to preferred language
 *
 * Note: Email is optional in the user model. Users register with username + password,
 * and can optionally bind OAuth (Google/GitHub) to add an email. The auth check
 * below only verifies the session and admin role, not email verification.
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
    // ── Check Bearer Token (for bot/Minniese automation) ──
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token) {
        const { prisma } = await import("@/lib/db");
        const bcrypt = await import("bcrypt");

        // Find users that have an apiToken set
        const usersWithToken = await prisma.user.findMany({
          where: { apiToken: { not: null } },
          select: { id: true, apiToken: true, roles: true },
        });

        let authorized = false;
        for (const user of usersWithToken) {
          if (user.apiToken && (await bcrypt.compare(token, user.apiToken))) {
            if (user.roles.includes("admin")) {
              authorized = true;
            }
            break;
          }
        }

        if (authorized) {
          return NextResponse.next();
        }

        if (isAdminApi) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Fall through to session check for admin pages (non-API)
      }
    }

    // ── Check Session (for browser users) ──
    const { auth } = await import("@/auth");
    const session = await auth();

    const isLoggedIn = !!session?.user;
    const roles = (session?.user as { roles?: string[] })?.roles || [];

    if (!isLoggedIn || !roles.includes("admin")) {
      if (isAdminApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Return a simple forbidden page instead of redirecting to login,
      // avoiding redirect loops when non-admin users visit /admin.
      return new NextResponse(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>无权限访问</title>
<style>
body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa;color:#333;text-align:center;padding:1rem}
h1{font-size:2rem;margin-bottom:.5rem}
p{color:#666;margin-bottom:2rem}
a{color:#2563eb;text-decoration:underline}
</style>
</head>
<body>
<h1>403 — 无权限访问</h1>
<p>你需要管理员权限才能访问此页面。</p>
<a href="/">返回首页</a>
</body>
</html>`,
        {
          status: 403,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
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
