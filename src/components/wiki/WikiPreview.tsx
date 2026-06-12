/**
 * @file WikiPreview — Hover preview component for wiki links.
 *
 * Listens for hover events on elements with `[data-wiki-name]` attributes,
 * fetches the wiki entry's definition, and displays a preview card.
 *
 * Features:
 * - 300ms hover delay before showing preview
 * - Caches fetched definitions to avoid redundant API calls
 * - Event delegation (no individual listeners per link)
 * - Scroll-aware (card repositions or hides on scroll)
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
import { Loader2, ExternalLink } from "lucide-react";

interface WikiPreviewProps {
  /** Current page language ('zh' | 'en') */
  lang: string;
}

interface CachedEntry {
  definition: string;
  expiresAt: number;
}

// Cache duration: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// Global cache shared across all WikiPreview instances
const globalCache = new Map<string, CachedEntry>();

/**
 * Fetches a wiki entry definition from the API.
 * Uses an in-memory cache to avoid repeated requests.
 */
async function fetchDefinition(wikiName: string, lang: string): Promise<string | null> {
  const cacheKey = `${lang}/${wikiName}`;
  const cached = globalCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.definition;
  }

  try {
    const res = await fetch(`/api/wiki/${encodeURIComponent(wikiName)}?lang=${lang}`);
    if (!res.ok) return null;

    const data = await res.json();
    const definition: string = data.entry?.blocks?.definition || data.entry?.definition || "";

    globalCache.set(cacheKey, {
      definition,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return definition;
  } catch {
    return null;
  }
}

export function WikiPreview({ lang }: WikiPreviewProps) {
  const [preview, setPreview] = useState<{
    definition: string;
    rect: DOMRect;
    wikiName: string;
  } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTargetRef = useRef<Element | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

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

      timerRef.current = setTimeout(async () => {
        // Check that mouse is still on the same element
        if (currentTargetRef.current !== target) return;

        const definition = await fetchDefinition(wikiName, lang);
        if (!definition || currentTargetRef.current !== target) return;

        const rect = target.getBoundingClientRect();
        setPreview({ definition, rect, wikiName });
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
      setPreview(null);
    }
  }, []);

  /**
   * Handles scroll events: hide preview when scrolling,
   * since the card position would become stale.
   */
  const handleScroll = useCallback(() => {
    if (preview) {
      // Update card position based on current element position
      if (currentTargetRef.current) {
        const rect = currentTargetRef.current.getBoundingClientRect();
        setPreview((prev) => (prev ? { ...prev, rect } : null));
      }
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
          className="fixed z-50 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg"
          style={{
            left: Math.min(
              preview.rect.left + preview.rect.width / 2 - 144,
              window.innerWidth - 304,
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
          }}
        >
          {/* Definition text */}
          <p className="text-sm leading-relaxed text-foreground">{preview.definition}</p>

          {/* "View full entry" link */}
          <a
            href={`/${lang}/wiki/${encodeURIComponent(preview.wikiName)}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {lang === "zh" ? "查看完整词条" : "View full entry"}
            <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </>
  );
}
