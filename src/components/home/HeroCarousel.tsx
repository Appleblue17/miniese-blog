/**
 * @file HeroCarousel — Displays a list of subtitles with a fade transition.
 *
 * Supports three modes:
 * - "sequential": starts at a random index, then cycles sequentially
 * - "shuffled": shuffles all subtitles randomly, then cycles through that order
 * - "static": picks one random subtitle and displays it statically (no rotation)
 *
 * Used inside HeroSection for the tagline rotation.
 *
 * NOTE: Uses useState(0) as initial value to avoid SSR/CSR hydration mismatch
 * from Math.random(). The random start/shuffle is set in a useEffect after mount.
 */

"use client";

import { useEffect, useRef, useState } from "react";

export type HeroSubtitleMode = "sequential" | "shuffled" | "static";

interface HeroCarouselProps {
  subtitles: string[];
  mode?: HeroSubtitleMode;
  interval?: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function HeroCarousel({ subtitles, mode = "sequential", interval = 5000 }: HeroCarouselProps) {
  // Start at 0 to avoid hydration mismatch from Math.random().
  // Random values are applied after mount via useEffect.
  const [currentIndex, setCurrentIndex] = useState(0);
  const [staticIndex, setStaticIndex] = useState(0);
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([]);
  const [visible, setVisible] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // After mount, set random values (only on client, avoids hydration mismatch)
  useEffect(() => {
    if (initialized) return;
    if (mode === "static" && subtitles.length > 0) {
      setStaticIndex(Math.floor(Math.random() * subtitles.length));
    } else if (mode === "sequential" && subtitles.length > 0) {
      setCurrentIndex(Math.floor(Math.random() * subtitles.length));
    } else if (mode === "shuffled" && subtitles.length > 0) {
      const order = shuffleArray(subtitles.map((_, i) => i));
      setShuffledOrder(order);
      setCurrentIndex(order[0]);
    }
    setInitialized(true);
  }, [mode, subtitles.length, initialized]);

  useEffect(() => {
    // Static mode: no rotation
    if (mode === "static") return;
    if (subtitles.length <= 1) return;

    const advanceSubtitle = () => {
      setVisible(false);
      setTimeout(() => {
        if (mode === "shuffled") {
          // Cycle through the pre-shuffled order
          setCurrentIndex((prev) => {
            const pos = shuffledOrder.indexOf(prev);
            return shuffledOrder[(pos + 1) % shuffledOrder.length];
          });
        } else {
          // Sequential: just increment
          setCurrentIndex((prev) => (prev + 1) % subtitles.length);
        }
        setVisible(true);
      }, 500); // fade out duration
    };

    intervalRef.current = setInterval(advanceSubtitle, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [subtitles.length, interval, mode, shuffledOrder]);

  if (subtitles.length === 0) return null;

  const displayIndex = mode === "static" ? staticIndex : currentIndex;

  return (
    <p
      className="text-lg sm:text-xl md:text-2xl font-light transition-opacity duration-500"
      style={{
        opacity: visible ? 1 : 0,
        textShadow: "0 2px 10px rgba(0,0,0,0.5)",
      }}
    >
      {subtitles[displayIndex]}
    </p>
  );
}
