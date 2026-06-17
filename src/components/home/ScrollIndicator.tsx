/**
 * @file ScrollIndicator — Animated arrow at the bottom of the Hero section.
 *
 * Gently pulses to indicate there is more content below the fold.
 * Clicking scrolls the page down by one viewport height.
 */

"use client";

import { ChevronDown } from "lucide-react";

export function ScrollIndicator() {
  const handleClick = () => {
    window.scrollBy({
      top: window.innerHeight,
      behavior: "smooth",
    });
  };

  return (
    <button
      onClick={handleClick}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/60 hover:text-white/90 transition-colors cursor-pointer z-20"
      aria-label="Scroll down"
    >
      <ChevronDown className="size-12" />
    </button>
  );
}
