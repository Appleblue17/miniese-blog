"use client";

import { useEffect } from "react";

/**
 * Loads site settings from the API and applies them as CSS variables on <html>.
 * Should be placed inside ThemeProvider so it can respond to theme changes.
 */
export function SettingsApplier() {
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) return;
        const settings = await res.json();
        if (cancelled) return;

        const a = settings.appearance;
        if (!a) return;

        // Detect dark mode
        const isDark =
          a.themeMode === "dark" ||
          (a.themeMode === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);

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
        root.style.setProperty("--primary-lightness", `${primaryLight}%`);
        root.style.setProperty("--accent-lightness", `${accentLight}%`);
        root.style.setProperty("--body-width", `${a.bodyWidth}rem`);

        const textColor = isDark ? (a.markdownTextColorDark ?? "#f0f6fc") : (a.markdownTextColorLight ?? "#1f2328");
        root.style.setProperty("--markdown-text-color", textColor);

        const bgColor = isDark ? (a.markdownBgColorDark ?? "#0d1117") : (a.markdownBgColorLight ?? "#ffffff");
        root.style.setProperty("--markdown-bg-color-global", bgColor);

        root.style.setProperty("--markdown-bg-opacity", `${a.markdownBgOpacity}%`);
      } catch {
        // Silently fail — defaults from CSS will be used
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return null;
}
