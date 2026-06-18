/**
 * @file TableOfContents - Extracts headings from rendered HTML and displays a side navigation.
 *
 * Features:
 * - Parse h1/h2/h3 (with existing `id` attribute from rehype-slug) from HTML string
 * - Click to smooth-scroll to the corresponding heading
 * - Highlight the currently visible section on scroll
 * - Auto-scroll TOC to keep active item visible
 * - Visual hierarchy via indent, font size, weight, and color
 *
 * Note: Heading IDs are generated server-side by rehype-slug in the markdown
 * renderer pipeline. This component uses those IDs directly.
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  html: string;
  lang?: string;
}

/**
 * Decode common HTML entities in a string.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x26;/g, "&")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Parse h1/h2/h3 tags from HTML and extract heading text + anchor IDs.
 *
 * Headings are expected to have an `id` attribute (added by rehype-slug during
 * server-side rendering). If the id is missing, the heading is skipped.
 */
function parseHeadings(html: string): TocItem[] {
  const items: TocItem[] = [];
  const headingRegex = /<h([1-3])(\s[^>]*)?>(.*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const attrs = match[2] || "";
    const rawText = match[3];

    // Extract id from attributes
    const idMatch = attrs.match(/\bid\s*=\s*"([^"]*)"/i);
    if (!idMatch) continue; // skip headings without an id

    const id = idMatch[1];
    if (!id) continue;

    // Strip inner HTML tags and decode entities
    const text = decodeHtmlEntities(rawText.replace(/<[^>]*>/g, "").trim());
    if (!text) continue;

    items.push({ id, text, level });
  }

  return items;
}

export function TableOfContents({ html, lang = "zh" }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const navRef = useRef<HTMLElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef(activeId);

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);

  // Keep ref in sync
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Parse headings from HTML (runs once on mount and when html changes)
  useEffect(() => {
    const parsed = parseHeadings(html);
    setHeadings(parsed);
  }, [html]);

  // Scroll-based active heading tracking
  // Uses only refs for activeId to avoid rebinding scroll listener on every change
  useEffect(() => {
    function updateActiveHeading() {
      if (isScrollingRef.current) return;

      // Look for headings inside the article body container (data-article-body)
      // rather than just the first <article> element — there are now two <article>
      // elements on the page (header in ArticleReader + body in ArticleContent).
      const body = document.querySelector<HTMLElement>("[data-article-body]");
      if (!body) return;

      const headingEls = Array.from(body.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]"));
      if (headingEls.length === 0) return;

      const scrollTop = window.scrollY;
      const offset = 100; // navbar offset

      // Find the last heading that is scrolled past (above or at current scroll position)
      let current: HTMLElement | null = null;
      for (const el of headingEls) {
        if (el.offsetTop - offset <= scrollTop + 1) {
          current = el;
        } else {
          break;
        }
      }

      const currentId = current?.id || "";
      if (currentId && currentId !== activeIdRef.current) {
        setActiveId(currentId);
      }
    }

    // Throttled scroll handler
    let ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateActiveHeading();
          ticking = false;
        });
        ticking = true;
      }
    }

    // Run once on mount
    updateActiveHeading();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Auto-scroll TOC to keep active button visible
  useEffect(() => {
    if (activeBtnRef.current && navRef.current) {
      const container = navRef.current;
      const btn = activeBtnRef.current;
      const btnRect = btn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      if (btnRect.top < containerRect.top || btnRect.bottom > containerRect.bottom) {
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeId]);

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    setIsOpen(false);

    const offset = 80;
    const targetY = el.getBoundingClientRect().top + window.scrollY - offset;
    const startY = window.scrollY;
    const distance = targetY - startY;
    const duration = Math.min(Math.abs(distance) * 0.3, 400);
    const startTime = performance.now();

    isScrollingRef.current = true;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease =
        progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      window.scrollTo(0, startY + distance * ease);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        // Immediately update active heading to the target after scroll
        setActiveId(id);
        // Release lock after a brief delay
        scrollTimerRef.current = setTimeout(() => {
          isScrollingRef.current = false;
        }, 80);
      }
    }

    requestAnimationFrame(step);
  }, []);

  if (headings.length === 0) return null;

  return (
    <>
      {/* Desktop: sidebar TOC */}
      <nav
        ref={navRef}
        className="hidden xl:block sticky top-24 w-56 shrink-0 max-h-[calc(100vh-8rem)] overflow-y-auto"
      >
        <h4 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          {t("目录", "Contents")}
        </h4>
        <ul className="space-y-0.5">
          {headings.map((item) => (
            <li key={item.id}>
              <button
                ref={(el) => {
                  if (activeId === item.id) activeBtnRef.current = el;
                }}
                type="button"
                onClick={() => handleClick(item.id)}
                className={`block w-full text-left py-1.5 pr-2 border-l-2 transition-colors hover:text-foreground ${
                  activeId === item.id
                    ? "border-primary text-foreground font-semibold"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/30"
                } ${
                  item.level === 1
                    ? "pl-2 text-sm font-medium"
                    : item.level === 2
                      ? "pl-5 text-sm"
                      : "pl-8 text-xs text-muted-foreground/80"
                }`}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile: collapsible TOC button — bottom-left to avoid Chat button overlap */}
      <div className="xl:hidden fixed bottom-6 left-6 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-center gap-2 rounded-full border border-border bg-background/80 backdrop-blur-sm px-4 py-3 md:px-5 md:py-3.5 text-sm md:text-base text-foreground shadow-lg min-h-[44px] md:min-h-[52px] hover:bg-accent transition-colors"
        >
          <svg
            className="size-4 md:size-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          {t("目录", "Contents")}
        </button>
      </div>

      {/* Mobile: dropdown overlay */}
      {isOpen && (
        <div className="xl:hidden fixed inset-0 z-40 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-h-[60vh] overflow-y-auto rounded-t-2xl bg-background p-6 md:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs md:text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t("目录", "Contents")}
              </h4>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <svg
                  className="size-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul className="space-y-1 text-sm md:text-base">
              {headings.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(item.id)}
                    className={`block w-full text-left py-2 px-2 rounded-md transition-colors ${
                      activeId === item.id
                        ? "bg-muted font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    } ${
                      item.level === 1
                        ? "pl-2 font-medium"
                        : item.level === 2
                          ? "pl-5"
                          : "pl-8 text-xs md:text-sm text-muted-foreground/80"
                    }`}
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
