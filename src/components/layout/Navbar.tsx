"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Library, Info, Settings, Menu, X, Bell, BarChart3 } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";

const navItems: Array<{ href: string; labelZh: string; labelEn: string; icon: React.ComponentType<{ className?: string }> }> = [
  { href: "/articles", labelZh: "文章", labelEn: "Articles", icon: FileText },
  { href: "/wiki", labelZh: "知识库", labelEn: "Wiki", icon: Library },
  { href: "/about", labelZh: "关于", labelEn: "About", icon: Info },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Extract language prefix from path (/zh/articles → zh)
  const lang = pathname.match(/^\/(zh|en)/)?.[1] || "zh";

  // Helper: prepend language prefix to href
  const localize = (href: string) => `/${lang}${href}`;

  return (
    <>
      {/* Mobile hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 xl:hidden size-11 rounded-full border border-border bg-background/80 backdrop-blur-sm shadow-sm"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? (lang === "zh" ? "关闭菜单" : "Close menu") : (lang === "zh" ? "打开菜单" : "Open menu")}
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {/* Sidebar */}
      <nav
        className={`
          fixed top-0 left-0 z-40 h-full w-56 border-r border-border
          flex flex-col p-4 transition-transform duration-200 sidebar-glass
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          xl:translate-x-0
        `}
        style={{
          // Semi-transparent overlay for readability when Hero image shows through
          backgroundColor: `color-mix(in srgb, var(--background) 30%, transparent)`,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {/* Logo */}
        <Link href={localize("")} className="mb-8 mt-2 text-lg font-semibold tracking-tight">
          Miniese&apos;s Blog
        </Link>

        {/* Navigation links */}
        <div className="flex flex-col gap-1">
          <Link
            href={localize("")}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base transition-colors hover:bg-muted ${
              pathname === localize("") ? "bg-muted font-medium text-primary-hsl" : ""
            }`}
          >
            <Home className="size-4" />
            {lang === "zh" ? "主页" : "Home"}
          </Link>

          {navItems.map((item) => {
            const fullHref = localize(item.href);
            const isActive = pathname.startsWith(fullHref);

            return (
              <Link
                key={item.href}
                href={fullHref}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base transition-colors hover:bg-muted ${
                  isActive ? "bg-muted font-medium text-primary-hsl" : ""
                }`}
              >
                <item.icon className="size-4" />
                {lang === "zh" ? item.labelZh : item.labelEn}
              </Link>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom area: admin links */}
        <div className="border-t border-border pt-3 space-y-1">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-base text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Settings className="size-4" />
            {lang === "zh" ? "仪表盘" : "Dashboard"}
          </Link>

          <Link
            href="/admin/notifications"
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-base text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Bell className="size-4" />
            {lang === "zh" ? "通知中心" : "Notifications"}
            <UnreadBadge />
          </Link>

          <Link
            href="/admin/ai/tokens"
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-base text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <BarChart3 className="size-4" />
            {lang === "zh" ? "Token 用量" : "AI Tokens"}
          </Link>
        </div>
      </nav>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 xl:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Client-side component that fetches unread notification count.
 * Shown as a red badge next to the "通知中心" link in the sidebar.
 */
function UnreadBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/admin/notifications?page=1&limit=1");
        if (!res.ok) return;
        const json = (await res.json()) as { unreadCount: number };
        if (!cancelled) setCount(json.unreadCount);
      } catch {
        // ignore
      }
    };
    fetchCount();
    // Poll every 60 seconds for new notifications
    const interval = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (count === null || count === 0) return null;

  return (
    <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
