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
  };
  pagination: {
    articlesPerPage: number;
    wikiPerPage: number;
  };
  appearance: {
    themeMode: "light" | "dark" | "system";
    bodyWidth: number;
    articleListLayout: "adaptive" | "fixed-1" | "fixed-2" | "fixed-3";
    wikiListLayout: "adaptive" | "fixed-1" | "fixed-2" | "fixed-3";
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

/**
 * Returns the current effective settings (default + custom merged).
 */
export async function getSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;

  const defaultPath = path.join(process.cwd(), "config/default-settings.json");
  const customPath = path.join(process.cwd(), "config/custom-settings.json");

  const defaultContent = await fs.readFile(defaultPath, "utf-8");
  const defaultSettings = JSON.parse(defaultContent) as AppSettings;

  let settings = defaultSettings;
  try {
    const customContent = await fs.readFile(customPath, "utf-8");
    const customSettings = JSON.parse(customContent) as Partial<AppSettings>;
    settings = mergeDeep(defaultSettings, customSettings) as AppSettings;
  } catch {
    // No custom config, use defaults
  }

  cachedSettings = settings;
  return settings;
}

/**
 * Updates settings by merging with current, writes to custom-settings.json.
 */
export async function updateSettings(
  updates: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getSettings();
  const merged = mergeDeep(current, updates) as AppSettings;

  const customPath = path.join(process.cwd(), "config/custom-settings.json");
  await fs.writeFile(customPath, JSON.stringify(merged, null, 2), "utf-8");

  cachedSettings = merged;
  return merged;
}

/**
 * Deep merge `source` into `target` (mutates target).
 * Only plain objects are merged recursively; arrays and primitives are overwritten.
 */
function mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      result[key] = mergeDeep(
        (target[key] as Record<string, unknown>) || {},
        val as Record<string, unknown>,
      );
    } else {
      result[key] = val;
    }
  }

  return result;
}
