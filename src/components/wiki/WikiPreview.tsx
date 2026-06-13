/**
 * @file WikiPreview — Hover preview component for wiki links.
 *
 * Listens for hover events on elements with `[data-wiki-name]` attributes,
 * fetches the wiki entry's detail, and displays a rich preview card with
 * definition, aliases, and tags.
 *
 * Features:
 * - 300ms hover delay before showing preview
 * - Caches fetched entries to avoid redundant API calls
 * - Event delegation (no individual listeners per link)
 * - Scroll-aware (card repositions on scroll)
 * - Mobile: tap-and-hold is handled by ignoring hover on touch devices
 *
 * Usage:
 * ```tsx
 * <WikiPreview lang="zh" />
 * ```
 * Place anywhere in the page. It will automatically detect wiki links
 * rendered in the DOM with `data-wiki-name` attributes.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Tag } from "lucide-react";

interface WikiPreviewProps {
  /** Current page language ('zh' | 'en') */
  lang: string;
}

interface PreviewData {
  name: string;
  definition: string;
  aliases: string[];
  tags: string[];
}

interface CachedEntry {
  data: PreviewData;
  expiresAt: number;
}

// Cache duration: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// Global cache shared across all WikiPreview instances
const globalCache = new Map<string, CachedEntry>();

/**
 * Fetches wiki entry detail from the API.
 * Uses an in-memory cache to avoid repeated requests.
 */
async function fetchEntry(wikiName: string, lang: string): Promise<PreviewData | null> {
  const cacheKey = `${lang}/${wikiName}`;
  const cached = globalCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  try {
    const res = await fetch(`/api/wiki/${encodeURIComponent(wikiName)}?lang=${lang}`);
    if (!res.ok) return null;

    const json = await res.json();
    const entry = json.entry;
    if (!entry) return null;

    const data: PreviewData = {
      name: entry.name,
      definition: entry.blocks?.definition || entry.definition || "",
      aliases: entry.aliases || [],
      tags: entry.tags || [],
    };

    globalCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return data;
  } catch {
    return null;
  }
}

export function WikiPreview({ lang }: WikiPreviewProps) {
  const [preview, setPreview] = useState<{
    data: PreviewData;
    rect: DOMRect;
  } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTargetRef = useRef<Element | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const currentNameRef = useRef<string | null>(null);

  // Check if device supports hover (i.e., not mobile)
  const [supportsHover, setSupportsHover] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    setSupportsHover(mq.matches);

    const handler = (e: MediaQueryListEvent) => setSupportsHover(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /**
   * Handles mouse entering a wiki link element.
   * Starts a 300ms timer; if the mouse stays, fetches and shows the preview.
   */
  const handleMouseEnter = useCallback(
    (e: MouseEvent) => {
      if (!supportsHover) return;

      const target = (e.target as Element).closest("[data-wiki-name]");
      if (!target) return;

      const wikiName = target.getAttribute("data-wiki-name");
      if (!wikiName) return;

      // Cancel any previous timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      currentTargetRef.current = target;
      currentNameRef.current = wikiName;

      timerRef.current = setTimeout(async () => {
        // Check that mouse is still on the same element
        if (currentTargetRef.current !== target || currentNameRef.current !== wikiName) return;

        const data = await fetchEntry(wikiName, lang);
        if (!data || currentTargetRef.current !== target) return;

        const rect = target.getBoundingClientRect();
        setPreview({ data, rect });
      }, 300);
    },
    [lang, supportsHover],
  );

  /**
   * Handles mouse leaving a wiki link.
   * Cancels the pending timer and hides the preview.
   */
  const handleMouseLeave = useCallback((e: MouseEvent) => {
    const target = (e.target as Element).closest("[data-wiki-name]");

    // Only dismiss if leaving the link (not entering the card)
    if (target && target === currentTargetRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      currentTargetRef.current = null;
      currentNameRef.current = null;
      setPreview(null);
    }
  }, []);

  /**
   * Handles scroll events: update card position on scroll.
   */
  const handleScroll = useCallback(() => {
    if (preview && currentTargetRef.current) {
      const rect = currentTargetRef.current.getBoundingClientRect();
      setPreview((prev) => (prev ? { ...prev, rect } : null));
    }
  }, [preview]);

  // Register global event listeners
  useEffect(() => {
    document.addEventListener("mouseover", handleMouseEnter);
    document.addEventListener("mouseout", handleMouseLeave);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    return () => {
      document.removeEventListener("mouseover", handleMouseEnter);
      document.removeEventListener("mouseout", handleMouseLeave);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [handleMouseEnter, handleMouseLeave, handleScroll]);

  // If device doesn't support hover (mobile), don't render anything
  if (!supportsHover) {
    return null;
  }

  return (
    <>
      {preview && (
        <div
          ref={cardRef}
          role="tooltip"
          className="wiki-preview-card fixed z-50 w-80 rounded-xl border border-accent/20 bg-popover p-4 shadow-xl backdrop-blur-sm"
          style={{
            left: Math.min(
              preview.rect.left + preview.rect.width / 2 - 160,
              window.innerWidth - 336,
            ),
            top: preview.rect.bottom + 8,
          }}
          onMouseEnter={() => {
            // Keep the card visible when hovering over it
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            setPreview(null);
            currentTargetRef.current = null;
            currentNameRef.current = null;
          }}
        >
          {/* Entry name */}
          <p className="text-sm font-semibold text-foreground mb-1">
            {preview.data.name}
          </p>

          {/* Aliases */}
          {preview.data.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {preview.data.aliases.map((alias) => (
                <span
                  key={alias}
                  className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {alias}
                </span>
              ))}
            </div>
          )}

          {/* Definition text */}
          <p className="text-sm leading-relaxed text-foreground/80 line-clamp-4">
            {preview.data.definition}
          </p>

          {/* Tags */}
          {preview.data.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Tag className="size-2.5 text-muted-foreground/50 shrink-0" />
              {preview.data.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground/70"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* "View full entry" link */}
          <a
            href={`/${lang}/wiki/${encodeURIComponent(preview.data.name)}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-hsl hover:text-accent-hsl-dark transition-colors"
          >
            {lang === "zh" ? "查看完整词条" : "View full entry"}
            <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </>
  );
}
