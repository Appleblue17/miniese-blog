/**
 * @file settings.ts — Configuration loading and merging logic.
 *
 * Reads default settings from `config/default-settings.json` and optionally
 * merges with user custom settings from `config/custom-settings.json`.
 */

import fs from "fs/promises";
import path from "path";

export interface AppSettings {
  site: {
    title: string;
    description: string;
    headerTitle: string;
    heroTitle: string;
    heroSubtitles: string[];
    heroSubtitlesEn: string[];
    heroSubtitleMode: "sequential" | "shuffled" | "static";
    heroSubtitleIntervalMs: number;
    heroImageLight: string;
    heroImageDark: string;
  };
  pagination: {
    articlesPerPage: number;
    wikiPerPage: number;
  };
  publish: {
    defaultAuthor: string;
  };
  appearance: {
    themeMode: "light" | "dark" | "system";
    bodyWidth: number;
    image: {
      maxWidth: number;
      maxHeight: number;
      defaultWidthRatio: number;
      lightboxEnabled: boolean;
      captionIgnoreList: string[];
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
  };
  features: Record<string, boolean>;
  notifications: Record<string, unknown>;
  compilers: Record<string, unknown>;
  prompts: Record<string, string>;
}

let cachedSettings: AppSettings | null = null;
const CACHE_TTL_MS = 5_000; // 5 seconds
let cacheTime = 0;

/**
 * Returns the current effective settings (default + custom merged).
 * Uses a short-lived cache (5s TTL) so worker and API routes see updates
 * without re-reading the file on every call.
 */
export async function getSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (cachedSettings && now - cacheTime < CACHE_TTL_MS) {
    return cachedSettings;
  }

  const defaultPath = path.join(process.cwd(), "config/default-settings.json");
  const customPath = path.join(process.cwd(), "config/custom-settings.json");

  const defaultContent = await fs.readFile(defaultPath, "utf-8");
  const defaultSettings = JSON.parse(defaultContent) as AppSettings;

  let settings: AppSettings = defaultSettings;
  try {
    const customContent = await fs.readFile(customPath, "utf-8");
    const customSettings = JSON.parse(customContent) as Partial<AppSettings>;
    settings = mergeDeep(defaultSettings, customSettings);
  } catch {
    // No custom config, use defaults
  }

  cachedSettings = settings;
  cacheTime = now;
  return settings;
}

/**
 * Clears the cached settings so the next getSettings() call re-reads from disk.
 * Used by the settings update API to ensure workers pick up changes immediately.
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
  cacheTime = 0;
}

/**
 * Updates settings by merging with current, writes to custom-settings.json.
 *
 * Empty-string prompt values are removed from the merge so they don't
 * override the defaults from default-settings.json. This allows the
 * "恢复默认" (reset to default) action to work correctly: setting a prompt
 * to an empty string restores the default template on next load.
 */
export async function updateSettings(
  updates: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getSettings();

  // Strip empty-string prompts so defaults remain in effect
  if (updates.prompts) {
    for (const key of Object.keys(updates.prompts)) {
      if (!updates.prompts[key]?.trim()) {
        delete updates.prompts[key];
      }
    }
  }

  const merged = mergeDeep(current, updates);

  const customPath = path.join(process.cwd(), "config/custom-settings.json");
  await fs.writeFile(customPath, JSON.stringify(merged, null, 2), "utf-8");

  cachedSettings = merged;
  return merged;
}

/**
 * Deep merge `source` into `target` (mutates target).
 * Only plain objects are merged recursively; arrays and primitives are overwritten.
 */
function mergeDeep(
  target: object,
  source: Partial<AppSettings>,
): AppSettings {
  const result = { ...target } as Record<string, unknown>;
  const t = target as Record<string, unknown>;

  for (const key of Object.keys(source) as (keyof AppSettings)[]) {
    const val = source[key];
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      result[key as string] = mergeDeep(
        (t[key as string] as Record<string, unknown>) || {},
        val as Partial<AppSettings>,
      );
    } else {
      result[key as string] = val;
    }
  }

  return result as unknown as AppSettings;
}
