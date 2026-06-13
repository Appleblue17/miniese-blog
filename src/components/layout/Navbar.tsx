"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, BookOpen, Info, Settings, Menu, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/articles", label: "文章", icon: FileText },
  { href: "/wiki", label: "知识库", icon: BookOpen },
  { href: "/about", label: "关于", icon: Info },
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
        className="fixed top-3 left-3 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {/* Sidebar */}
      <nav
        className={`
          fixed top-0 left-0 z-40 h-full w-56 border-r border-border bg-background
          flex flex-col p-4 transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Logo */}
        <Link href={localize("")} className="mb-8 mt-2 text-lg font-semibold tracking-tight">
          Miniese&apos;s Blog
        </Link>

        {/* Navigation links */}
        <div className="flex flex-col gap-1">
          <Link
            href={localize("")}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${
              pathname === localize("") ? "bg-muted font-medium text-primary-hsl" : ""
            }`}
          >
            <Home className="size-4" />
            主页
          </Link>

          {navItems.map((item) => {
            const fullHref = localize(item.href);
            const isActive = pathname.startsWith(fullHref);

            return (
              <Link
                key={item.href}
                href={fullHref}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${
                  isActive ? "bg-muted font-medium text-primary-hsl" : ""
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom area: admin link */}
        <div className="border-t border-border pt-3">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="size-4" />
            仪表盘
          </Link>
        </div>
      </nav>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
