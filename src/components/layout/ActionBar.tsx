/**
 * @file ActionBar - Floating action buttons in the top-right corner.
 *
 * Contains:
 * - Language toggle (zh ↔ en)
 * - Theme toggle (light ↔ dark)
 * - Placeholder for user/login (future)
 */

"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { Globe, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function ActionBar() {
  const pathname = usePathname();

  // Extract language prefix from path (/zh/articles → zh)
  const lang = pathname.match(/^\/(zh|en)/)?.[1] || "zh";

  const handleLanguageSwitch = useCallback(() => {
    const newLang = lang === "zh" ? "en" : "zh";
    const newPath = pathname.replace(/^\/(zh|en)/, `/${newLang}`);
    document.cookie = `preferred_lang=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.href = newPath;
  }, [lang, pathname]);

  // Don't render on admin pages
  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-1 rounded-full border border-border bg-background/80 backdrop-blur-sm px-1.5 py-1 shadow-sm">
      {/* Language toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLanguageSwitch}
        className="size-8 rounded-full"
        aria-label={lang === "zh" ? "切换至 English" : "切换到中文"}
        title={lang === "zh" ? "English" : "中文"}
      >
        <Globe className="size-5" />
        <span className="text-[10px] font-medium ml-0.5">
          {lang === "zh" ? "中" : "EN"}
        </span>
      </Button>

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* User / Login placeholder (future) */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        aria-label="登录"
        title="登录"
        disabled
      >
        <LogIn className="size-4" />
      </Button>
    </div>
  );
}
