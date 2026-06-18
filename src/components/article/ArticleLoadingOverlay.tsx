/**
 * @file ArticleLoadingOverlay — Full-page loading overlay for the article reader.
 *
 * Displays a centered illustration (Miniese reading/writing) with a ring spinner
 * at the top-right corner and "Loading..." text below.
 *
 * The overlay auto-detects when [data-article-body] enters the DOM (body rendered)
 * and triggers a fade-out + scale(0.95) transition.
 *
 * Lifecycle:
 *   1. Mounted while meta is being fetched (ArticleReader + ArticleContent skeletons visible)
 *   2. Stays visible after meta arrives, while body is being fetched
 *   3. Auto-detects body DOM → starts 400ms fade-out
 *   4. After fade-out → sets display:none (hidden from accessibility tree)
 */

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface ArticleLoadingOverlayProps {
  lang: string;
}

// ─── Overlay component ───────────────────────────────────────────────────────

export function ArticleLoadingOverlay({ lang }: ArticleLoadingOverlayProps) {
  const [phase, setPhase] = useState<"visible" | "fading" | "hidden">("visible");
  const containerRef = useRef<HTMLDivElement>(null);

  // Watch for [data-article-body] entering the DOM
  useEffect(() => {
    // Check if body is already in DOM (race condition safeguard)
    if (document.querySelector("[data-article-body]")) {
      setPhase("fading");
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector("[data-article-body]")) {
        setPhase("fading");
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // After fade-out completes, set to hidden
  useEffect(() => {
    if (phase !== "fading") return;

    const timer = setTimeout(() => {
      setPhase("hidden");
    }, 400); // matches CSS transition duration

    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-40 flex items-center justify-center ${
        phase === "fading"
          ? "opacity-0 pointer-events-none"
          : "opacity-100"
      }`}
      style={{
        transition: "opacity 400ms ease-out",
      }}
    >
      {/* Slight breathing animation on the illustration while visible */}
      <div
        className={`relative flex flex-col items-center gap-4 ${
          phase === "visible" ? "" : ""
        }`}
        style={{
          transition: "transform 700ms ease-in-out",
          ...(phase === "visible"
            ? { animation: "loading-breath 3s ease-in-out infinite" }
            : {}),
        }}
      >
        {/* Illustration container */}
        <div className="relative">
          <Image
            src="/images/miniese/inset/loading.png"
            alt={lang === "zh" ? "加载中" : "Loading"}
            width={240}
            height={240}
            className="select-none pointer-events-none"
            priority
            unoptimized
          />

          {/* Ring spinner at top-right of the illustration */}
          <div className="absolute -top-2 -right-2">
            <LoadingSpinner size={18} className="border-2" />
          </div>
        </div>

        {/* Loading text */}
        <p className="text-sm text-muted-foreground tracking-wider">
          {lang === "zh" ? "加载中..." : "Loading..."}
        </p>
      </div>
    </div>
  );
}
