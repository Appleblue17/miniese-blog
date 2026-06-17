"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

/**
 * Loads site settings from the API and applies them as CSS variables on <html>.
 * Listens to theme changes (light/dark) and re-applies the correct color values.
 * Should be placed inside ThemeProvider so it can respond to theme changes.
 */
export function SettingsApplier() {
  const { resolvedTheme } = useTheme();
  const settingsRef = useRef<AppearanceSettings | null>(null);

  // Fetch settings once
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) return;
        const settings = await res.json();
        if (cancelled) return;

        const a = settings.appearance as AppearanceSettings | undefined;
        if (!a) return;

        settingsRef.current = a;
        applySettings(a, resolvedTheme ?? "light");
      } catch {
        // Silently fail — defaults from CSS will be used
      }
    }

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep data-theme attribute in sync with the current theme class
  // so that github-markdown.css [data-theme="dark"] selectors work after theme switching.
  // Also re-apply settings when theme changes (after settings have been fetched).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme ?? "light");
    if (settingsRef.current) {
      applySettings(settingsRef.current, resolvedTheme ?? "light");
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
  backgroundImage: string;
  backgroundOpacity: number;
  markdownBgOpacity: number;
  markdownTextColorLight: string;
  markdownTextColorDark: string;
  markdownBgColorLight: string;
  markdownBgColorDark: string;
}

function applySettings(a: AppearanceSettings, resolvedTheme: string) {
  const isDark = resolvedTheme === "dark";

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

  const textColor = isDark ? (a.markdownTextColorDark ?? "#f0f6fc") : (a.markdownTextColorLight ?? "#1f2328");
  root.style.setProperty("--markdown-text-color", textColor);

  const bgColor = isDark ? (a.markdownBgColorDark ?? "#0d1117") : (a.markdownBgColorLight ?? "#ffffff");
  root.style.setProperty("--markdown-bg-color-global", bgColor);

  root.style.setProperty("--markdown-bg-opacity", `${a.markdownBgOpacity}%`);

  // Global background image
  if (a.backgroundImage) {
    root.style.setProperty("--bg-image", `url(${a.backgroundImage})`);
  } else {
    root.style.setProperty("--bg-image", "none");
  }
  root.style.setProperty("--bg-opacity", `${a.backgroundOpacity}%`);
}
