/**
 * @file TableOfContents - Extracts headings from rendered HTML and displays a side navigation.
 *
 * Features:
 * - Parse h1/h2/h3 from HTML string to generate TOC, decode HTML entities
 * - Click to smooth-scroll to the corresponding heading
 * - Highlight the currently visible section on scroll
 * - Auto-scroll TOC to keep active item visible
 * - Visual hierarchy via indent, font size, weight, and color
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
 * Generate a stable anchor ID from heading text.
 * Uses a running counter to avoid duplicates.
 */
function generateId(text: string, seen: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const key = base || "heading";
  const count = seen.get(key) || 0;
  seen.set(key, count + 1);
  return count === 0 ? key : `${key}-${count}`;
}

/**
 * Parse h1/h2/h3 tags from HTML and extract heading text + generate anchor IDs.
 */
function parseHeadings(html: string): TocItem[] {
  const items: TocItem[] = [];
  const headingRegex = /<h([1-3])(?:\s[^>]*)?>(.*?)<\/h\1>/gi;
  const seenIds = new Map<string, number>();
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const rawText = match[2];
    // Strip inner HTML tags and decode entities
    const text = decodeHtmlEntities(rawText.replace(/<[^>]*>/g, "").trim());
    if (!text) continue;

    items.push({
      id: generateId(text, seenIds),
      text,
      level,
    });
  }

  return items;
}

export function TableOfContents({ html }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const navRef = useRef<HTMLElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingElsRef = useRef<HTMLElement[]>([]);

  // Parse headings and inject IDs
  useEffect(() => {
    const parsed = parseHeadings(html);
    setHeadings(parsed);

    if (parsed.length === 0) return;

    const article = document.querySelector("article");
    if (!article) return;

    // Scan all h1-h3 elements in order and assign IDs sequentially
    const allHeadings = article.querySelectorAll("h1, h2, h3");
    let headingIdx = 0;

    allHeadings.forEach((el) => {
      if (headingIdx >= parsed.length) return;
      const expected = parsed[headingIdx];
      const elText = decodeHtmlEntities((el.textContent || "").trim());
      if (elText === expected.text) {
        el.id = expected.id;
        headingIdx++;
      }
    });

    // Collect heading elements for scroll-based active tracking
    headingElsRef.current = parsed
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];
  }, [html]);

  // Scroll-based active heading tracking
  useEffect(() => {
    const headingEls = headingElsRef.current;
    if (headingEls.length === 0) return;

    function updateActiveHeading() {
      if (isScrollingRef.current) return;

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

      if (current && current.id !== activeId) {
        setActiveId(current.id);
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
  }, [activeId]);

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
          Table of Contents
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

      {/* Mobile: collapsible TOC button */}
      <div className="xl:hidden fixed bottom-20 right-4 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg min-h-[44px]"
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Contents
        </button>
      </div>

      {/* Mobile: dropdown overlay */}
      {isOpen && (
        <div className="xl:hidden fixed inset-0 z-40 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-h-[60vh] overflow-y-auto rounded-t-2xl bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Table of Contents
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
            <ul className="space-y-1 text-sm">
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
                          : "pl-8 text-xs text-muted-foreground/80"
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
