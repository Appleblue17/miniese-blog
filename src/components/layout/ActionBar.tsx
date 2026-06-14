/**
 * @file ActionBar - Floating action buttons in the top-right corner.
 *
 * Contains:
 * - Language toggle (zh ↔ en) — hidden on wiki entries and admin pages
 * - Theme toggle (light ↔ dark)
 * - User menu / login button (authenticated state)
 *
 * Visibility rules:
 * - All pages show the bar (public + admin)
 * - Language toggle hidden on:
 *   - wiki entry pages (/zh/wiki/{name}, /en/wiki/{name})
 *   - admin dashboard pages (/admin/*)
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Globe, LogIn, User, Settings, LayoutDashboard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface UserInfo {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

export function ActionBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch user session
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Extract language prefix from path (/zh/articles → zh)
  const lang = pathname.match(/^\/(zh|en)/)?.[1] || "zh";

  const handleLanguageSwitch = useCallback(() => {
    const newLang = lang === "zh" ? "en" : "zh";
    const newPath = pathname.replace(/^\/(zh|en)/, `/${newLang}`);
    document.cookie = `preferred_lang=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.href = newPath;
  }, [lang, pathname]);

  const handleLogout = async () => {
    const { signOut } = await import("next-auth/react");
    await signOut({ callbackUrl: "/" });
  };

  // Hide language toggle on wiki entry pages and admin pages
  const isWikiEntry = /^\/(zh|en)\/wiki\/[^/]+$/.test(pathname);
  const isAdmin = pathname.startsWith("/admin");
  const showLangToggle = !isWikiEntry && !isAdmin;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-1 rounded-full border border-border bg-background/80 backdrop-blur-sm px-1.5 py-1 shadow-sm">
      {/* Language toggle */}
      {showLangToggle && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLanguageSwitch}
            className="size-8 rounded-full"
            aria-label={lang === "zh" ? "切换至 English" : "切换到中文"}
            title={lang === "zh" ? "English" : "中文"}
          >
            <Globe className="size-5" />
            <span className="text-[10px] font-medium ml-0.5">{lang === "zh" ? "中" : "EN"}</span>
          </Button>

          {/* Separator */}
          <div className="h-4 w-px bg-border" />
        </>
      )}

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* User menu / Login button */}
      <div className="relative" ref={menuRef}>
        {user ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(!menuOpen)}
              className="size-8 rounded-full"
              aria-label="用户菜单"
              title={user.name || user.email || "用户"}
            >
              <User className="size-4" />
            </Button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-background shadow-lg py-1.5">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium truncate">{user.name || "用户"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>

                <button
                  onClick={() => { setMenuOpen(false); router.push("/settings"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
                >
                  <Settings className="size-4" />
                  个人设置
                </button>

                {user.role === "admin" && (
                  <button
                    onClick={() => { setMenuOpen(false); router.push("/admin"); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
                  >
                    <LayoutDashboard className="size-4" />
                    仪表盘
                  </button>
                )}

                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-accent/50 transition-colors"
                  >
                    <LogOut className="size-4" />
                    登出
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/login")}
            className="size-8 rounded-full"
            aria-label="登录"
            title="登录"
          >
            <LogIn className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
