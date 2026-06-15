/**
 * @file Lightbox — A full-screen image lightbox component.
 *
 * Features:
 * - Full-screen overlay with image display
 * - Click to close
 * - Keyboard navigation (Escape to close)
 * - Keyboard arrow keys for navigation between images (optional)
 *
 * Props:
 *   src: string — Image URL to display
 *   alt: string — Alt text for the image
 *   onClose: () => void — Close handler
 *   onPrev?: () => void — Previous image handler (optional)
 *   onNext?: () => void — Next image handler (optional)
 *   hasPrev?: boolean — Whether there's a previous image
 *   hasNext?: boolean — Whether there's a next image
 */

"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalImages?: number;
  captionIgnoreList?: string[];
}

export function Lightbox({
  src,
  alt,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  currentIndex,
  totalImages,
  captionIgnoreList = [],
}: LightboxProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const showCaption = !captionIgnoreList.includes(alt);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Reset zoom when src changes
  useEffect(() => {
    setScale(1);
  }, [src]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && onPrev && hasPrev) {
        onPrev();
      } else if (e.key === "ArrowRight" && onNext && hasNext) {
        onNext();
      }
    },
    [onClose, onPrev, onNext, hasPrev, hasNext],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Close on overlay click (not on image click)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const next = Math.round((prev + delta) * 10) / 10;
      return Math.max(0.2, Math.min(5, next));
    });
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onWheel={handleWheel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 transition-colors z-10"
        aria-label="关闭"
      >
        <X className="size-6" />
      </button>

      {/* Previous button — full-height hit zone */}
      {onPrev && hasPrev && (
        <button
          type="button"
          onClick={onPrev}
          className="absolute left-0 top-0 bottom-0 w-[10%] min-w-[48px] flex items-center justify-start group z-10 cursor-pointer transition-colors duration-200 hover:bg-gradient-to-r hover:from-white/20 hover:to-transparent"
          aria-label="上一张"
        >
          <span className="ml-2 rounded-full bg-black/40 p-2 text-white">
            <ChevronLeft className="size-8" />
          </span>
        </button>
      )}

      {/* Next button — full-height hit zone */}
      {onNext && hasNext && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-0 top-0 bottom-0 w-[10%] min-w-[48px] flex items-center justify-end group z-10 cursor-pointer transition-colors duration-200 hover:bg-gradient-to-l hover:from-white/20 hover:to-transparent"
          aria-label="下一张"
        >
          <span className="mr-2 rounded-full bg-black/40 p-2 text-white">
            <ChevronRight className="size-8" />
          </span>
        </button>
      )}

      {/* Image caption — top of the image */}
      {showCaption && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 rounded-lg bg-black/40 px-4 py-2 text-base text-white max-w-[80vw] text-center z-10">
          <p className="truncate">{alt}</p>
        </div>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ transform: `scale(${scale})` }}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none transition-transform duration-100"
        draggable={false}
      />

      {/* Bottom info — zoom percentage + image index */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
        {scale !== 1 && (
          <p className="font-mono tabular-nums text-white/80 text-sm mb-1">
            {Math.round(scale * 100)}%
          </p>
        )}
        {totalImages !== undefined && currentIndex !== undefined && (
          <p className="font-mono tabular-nums text-white/60 text-xs">
            {currentIndex + 1} / {totalImages}
          </p>
        )}
      </div>
    </div>
  );
}
