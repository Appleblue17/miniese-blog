"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

/**
 * Loads site settings from the API and applies them as CSS variables on <html>.
 * Listens to theme changes (light/dark) and re-applies the correct color values.
 * Should be placed inside ThemeProvider so it can respond to theme changes.
 *
 * Background images: each entry in backgroundImages can be a file path or
 * a directory path (e.g., "/images/bg"), which will be expanded to all image
 * files inside that directory.
 */
export function SettingsApplier() {
  const { resolvedTheme } = useTheme();
  const settingsRef = useRef<AppearanceSettings | null>(null);
  const expandedRef = useRef<string[]>([]); // Cached expanded image URLs

  // Fetch settings once
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [res, _mediaRes] = await Promise.all([
          fetch("/api/admin/settings"),
          // Also warm up media API cache
          fetch("/api/admin/media?dir=/images").catch(() => null),
        ]);
        if (!res.ok) return;
        const settings = await res.json();
        if (cancelled) return;

        const a = settings.appearance as AppearanceSettings | undefined;
        if (!a) return;

        settingsRef.current = a;
        await applySettingsAsync(a, resolvedTheme ?? "light", expandedRef);
      } catch {
        // Silently fail — defaults from CSS will be used
      }
    }

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply settings when theme changes (after settings have been fetched).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme ?? "light");
    if (settingsRef.current) {
      applySettingsAsync(settingsRef.current, resolvedTheme ?? "light", expandedRef);
    }
  }, [resolvedTheme]);

  return null;
}

interface AppearanceSettings {
  themeMode: string;
  bodyWidth: number;
  image?: {
    maxWidth?: number;
    maxHeight?: number;
    defaultWidthRatio?: number;
    lightboxEnabled?: boolean;
  };
  primary: { lightHue: number; darkHue: number; lightSaturation: number; darkSaturation: number; lightLightness: number; darkLightness: number };
  accent: { lightHue: number; darkHue: number; lightSaturation: number; darkSaturation: number; lightLightness: number; darkLightness: number };
  backgroundImages: string[];
  backgroundOpacityLight: number;
  backgroundOpacityDark: number;
  markdownBgOpacityLight: number;
  markdownBgOpacityDark: number;
  markdownTextColorLight: string;
  markdownTextColorDark: string;
  markdownBgColorLight: string;
  markdownBgColorDark: string;
}

/**
 * Checks if a path looks like a directory (not a file extension).
 */
function isDirectoryPath(p: string): boolean {
  if (!p) return false;
  // Paths ending with / are directories
  if (p.endsWith("/")) return true;
  // Paths without a file extension are likely directories
  const lastSegment = p.split("/").pop() || p;
  return !lastSegment.includes(".");
}

/**
 * Expands a single path to image files. If the path is a directory,
 * fetches its contents via the media API and returns image file paths.
 * Otherwise returns the path as-is if it's a valid image.
 */
async function expandPathToImages(p: string): Promise<string[]> {
  if (!p) return [];

  if (isDirectoryPath(p)) {
    try {
      const dir = p.endsWith("/") ? p.slice(0, -1) : p;
      const res = await fetch(`/api/admin/media?dir=${encodeURIComponent(dir)}`);
      if (!res.ok) return [p]; // Fallback: use as-is
      const data = await res.json();
      const images: string[] = (data.files || [])
        .filter((f: { isImage: boolean }) => f.isImage)
        .map((f: { path: string }) => f.path);
      return images.length > 0 ? images : [p]; // Fallback if no images found
    } catch {
      return [p]; // Fallback: use as-is
    }
  }

  // Single file path — return as-is
  return [p];
}

/**
 * Applies settings to CSS variables. Async because it may need to expand
 * directory paths to individual image files.
 */
async function applySettingsAsync(
  a: AppearanceSettings,
  resolvedTheme: string,
  expandedRef: React.MutableRefObject<string[]>,
) {
  const isDark = resolvedTheme === "dark";

  // Apply colors synchronously first
  applyColorsSync(a, isDark);

  // Expand background images (async) — each entry can be a file or directory
  const bgImages = a.backgroundImages?.filter(Boolean) ?? [];
  const expandedArrays = await Promise.all(
    bgImages.map((p) => expandPathToImages(p)),
  );
  const allImages = expandedArrays.flat();

  // Cache expanded results
  expandedRef.current = allImages;

  // Pick a random image from the expanded list
  let bgUrl = "";
  if (allImages.length > 0) {
    const seed = `${resolvedTheme}-${Date.now()}`;
    const idx = Math.abs(hashString(seed)) % allImages.length;
    bgUrl = allImages[idx];
  }

  const root = document.documentElement;
  if (bgUrl) {
    root.style.setProperty("--bg-image", `url(${bgUrl})`);
  } else {
    root.style.setProperty("--bg-image", "none");
  }
  root.style.setProperty("--bg-opacity", `${(isDark ? (a.backgroundOpacityDark ?? 10) : (a.backgroundOpacityLight ?? 10)) / 100}`);
}

/**
 * Applies color-related CSS variables synchronously.
 */
function applyColorsSync(a: AppearanceSettings, isDark: boolean) {
  const primaryHue = isDark ? a.primary.darkHue : a.primary.lightHue;
  const accentHue = isDark ? a.accent.darkHue : a.accent.lightHue;

  const root = document.documentElement;
  root.style.setProperty("--primary-hue", String(primaryHue));
  root.style.setProperty("--accent-hue", String(accentHue));
  const primarySat = isDark ? a.primary.darkSaturation : a.primary.lightSaturation;
  const accentSat = isDark ? a.accent.darkSaturation : a.accent.lightSaturation;
  root.style.setProperty("--primary-sat", `${primarySat}%`);
  root.style.setProperty("--accent-sat", `${accentSat}%`);

  const primaryLight = isDark ? a.primary.darkLightness : a.primary.lightLightness;
  const accentLight = isDark ? a.accent.darkLightness : a.accent.lightLightness;
  const primaryDark = Math.max(primaryLight - 20, 10);
  const primaryLightest = Math.min(primaryLight + 20, 90);
  const accentDark = Math.max(accentLight - 20, 10);
  const accentLightest = Math.min(accentLight + 20, 90);
  root.style.setProperty("--primary-lightness", `${primaryLight}%`);
  root.style.setProperty("--accent-lightness", `${accentLight}%`);
  root.style.setProperty("--primary-light", `${primaryLight}%`);
  root.style.setProperty("--primary-dark", `${primaryDark}%`);
  root.style.setProperty("--primary-lightest", `${primaryLightest}%`);
  root.style.setProperty("--accent-light", `${accentLight}%`);
  root.style.setProperty("--accent-light-dark", `${accentDark}%`);
  root.style.setProperty("--accent-light-lightest", `${accentLightest}%`);
  root.style.setProperty("--body-width", `${a.bodyWidth}rem`);

  // Image settings
  const img = a.image ?? {};
  root.style.setProperty("--image-max-width", `${img.maxWidth ?? 800}px`);
  root.style.setProperty("--image-width-ratio", `${img.defaultWidthRatio ?? 60}%`);

  const textColor = isDark
    ? a.markdownTextColorDark ?? "#f0f6fc"
    : a.markdownTextColorLight ?? "#1f2328";
  root.style.setProperty("--markdown-text-color", textColor);

  const bgColor = isDark
    ? a.markdownBgColorDark ?? "#0d1117"
    : a.markdownBgColorLight ?? "#ffffff";
  root.style.setProperty("--markdown-bg-color-global", bgColor);

  root.style.setProperty("--markdown-bg-opacity", `${(isDark ? (a.markdownBgOpacityDark ?? 80) : (a.markdownBgOpacityLight ?? 80))}%`);
}

/** Simple string hash for deterministic random selection */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
