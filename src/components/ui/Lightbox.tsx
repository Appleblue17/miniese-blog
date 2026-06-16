/**
 * @file Lightbox — A full-screen image lightbox component.
 *
 * Features:
 * - Full-screen overlay with image display
 * - Click overlay to close
 * - Mouse wheel zoom (desktop)
 * - Touch pinch-to-zoom (mobile)
 * - Touch drag-to-pan (mobile)
 * - Keyboard navigation (Escape to close, Arrow keys for prev/next)
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
import { ChevronLeft, ChevronRight } from "lucide-react";

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

/** Minimum pinch distance to trigger zoom (in CSS pixels) */
const PINCH_THRESHOLD = 10;

/** Clamp scale to [MIN_SCALE, MAX_SCALE] */
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;

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
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Refs for touch gesture tracking
  const pinchRef = useRef<{
    initialDist: number;
    initialScale: number;
    midX: number;
    midY: number;
  } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialTranslateX: number;
    initialTranslateY: number;
  } | null>(null);

  const showCaption = !captionIgnoreList.includes(alt);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Reset zoom and pan when src changes
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    pinchRef.current = null;
    dragRef.current = null;
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

  // Close on overlay click (not on image or nav buttons)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  // Mouse wheel zoom (desktop)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const next = Math.round((prev + delta) * 10) / 10;
      return clampScale(next);
    });
    setTranslate({ x: 0, y: 0 });
  }, []);

  // ----- Touch handlers for pinch-to-zoom and drag-to-pan -----

  /** Calculate Euclidean distance between two touch points */
  function getTouchDistance(t1: React.Touch, t2: React.Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    if (touches.length === 2) {
      // Two-finger pinch start
      e.preventDefault();
      const dist = getTouchDistance(touches[0], touches[1]);
      pinchRef.current = {
        initialDist: dist,
        initialScale: scale, // Capture current scale at start
        midX: (touches[0].clientX + touches[1].clientX) / 2,
        midY: (touches[0].clientY + touches[1].clientY) / 2,
      };
      // Stop any single-finger drag
      dragRef.current = null;
    } else if (touches.length === 1) {
      // Single-finger drag start (only allow when zoomed in)
      if (scale > 1) {
        dragRef.current = {
          startX: touches[0].clientX,
          startY: touches[0].clientY,
          initialTranslateX: translate.x,
          initialTranslateY: translate.y,
        };
      }
    }
  }, [scale, translate]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;

    // Pinch zoom (2 fingers)
    if (touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = getTouchDistance(touches[0], touches[1]);
      const ratio = dist / pinchRef.current.initialDist;
      const newScale = clampScale(pinchRef.current.initialScale * ratio);
      setScale(newScale);
      return;
    }

    // Single-finger drag (only when zoomed in > 1)
    if (touches.length === 1 && dragRef.current && scale > 1) {
      e.preventDefault();
      const dx = touches[0].clientX - dragRef.current.startX;
      const dy = touches[0].clientY - dragRef.current.startY;

      // Constrain panning so the image never leaves the viewport.
      // At scale S, the image overhangs the viewport by (S-1)*vw/2 on each side.
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      // max distance image edge can move from viewport edge
      const maxPanX = (viewportW * (scale - 1)) / 2;
      const maxPanY = (viewportH * (scale - 1)) / 2;

      const panX = Math.max(-maxPanX, Math.min(maxPanX, dragRef.current.initialTranslateX + dx));
      const panY = Math.max(-maxPanY, Math.min(maxPanY, dragRef.current.initialTranslateY + dy));

      setTranslate({ x: panX, y: panY });
      return;
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // If both fingers lifted, clear pinch state
    if (e.touches.length < 2) {
      pinchRef.current = null;
    }
    // If no fingers remain, clear drag state
    if (e.touches.length === 0) {
      dragRef.current = null;
    }
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 touch-none select-none"
    >
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
        <div className="absolute top-20 left-1/2 -translate-x-1/2 rounded-lg bg-black/40 px-4 py-2 text-base text-white max-w-[80vw] text-center z-10 pointer-events-none">
          <p className="truncate">{alt}</p>
        </div>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
        }}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none transition-none"
        draggable={false}
      />

      {/* Bottom info — zoom percentage + image index */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center pointer-events-none">
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

/** Clamp a scale value to [MIN_SCALE, MAX_SCALE] */
function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}
