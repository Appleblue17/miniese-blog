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
  const observerRef = useRef<IntersectionObserver | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

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

    // Set up intersection observer
    const headingEls = parsed
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    if (headingEls.length === 0) return;

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the top-most intersecting heading (last entry with isIntersecting)
        let topId = "";
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // If this entry is higher up (lower top), it's the top-most
            const rect = entry.boundingClientRect;
            if (!topId || rect.top < (document.getElementById(topId)?.getBoundingClientRect().top ?? Infinity)) {
              topId = entry.target.id;
            }
          }
        }
        if (topId) {
          setActiveId(topId);
        }
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );

    headingEls.forEach((el) => observer.observe(el));
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [html]);

  // Auto-scroll TOC to keep active button visible
  useEffect(() => {
    if (activeBtnRef.current && navRef.current) {
      const container = navRef.current;
      const btn = activeBtnRef.current;
      const btnRect = btn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      if (
        btnRect.top < containerRect.top ||
        btnRect.bottom > containerRect.bottom
      ) {
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeId]);

  const handleClick = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (el) {
        // Use offset to account for sticky navbar
        const offset = 80;
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: "smooth" });
        setIsOpen(false);
      }
    },
    [],
  );

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
                className={`block w-full text-left py-1 pr-2 border-l-2 transition-colors hover:text-foreground ${
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
      <div className="xl:hidden fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg"
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h7"
            />
          </svg>
          Contents
        </button>
      </div>

      {/* Mobile: dropdown overlay */}
      {isOpen && (
        <div className="xl:hidden fixed inset-0 z-40 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative w-full max-h-[60vh] overflow-y-auto rounded-t-2xl bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Table of Contents
              </h4>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                    className={`block w-full text-left py-1.5 px-2 rounded-md transition-colors ${
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
