/**
 * @file promptLoader.ts — Loads effective prompts from settings.
 *
 * Resolves the effective prompt for a given key:
 * 1. If the merged settings (default + custom) have a non-empty value, use it
 * 2. Otherwise, fall back to the hardcoded default from default-settings.json
 *
 * This ensures callers always receive a valid prompt string, removing the
 * need for fallback logic in individual handlers.
 */

import fs from "fs/promises";
import path from "path";
import { getSettings } from "../../../config/settings";

/**
 * Loads the effective prompt for the given key from site settings.
 *
 * Returns the prompt string from merged settings (default + custom overrides).
 * If the merged value is empty, falls back to the raw default from
 * default-settings.json. This ensures callers always get a valid prompt.
 *
 * @param key - The prompt key (e.g., "review", "translate", "discovery", "generate")
 * @returns The effective prompt string (never null)
 */
export async function loadCustomPrompt(key: string): Promise<string> {
  try {
    const settings = await getSettings();
    const val = settings.prompts[key];
    if (val && val.trim()) {
      return val.trim();
    }

    // Fall back to raw default-settings.json (in case custom-settings.json
    // overwrote the merged value with an empty string)
    const defaultPath = path.join(process.cwd(), "config/default-settings.json");
    const defaultContent = await fs.readFile(defaultPath, "utf-8");
    const defaultSettings = JSON.parse(defaultContent) as Record<string, unknown>;
    const prompts = defaultSettings.prompts as Record<string, string> | undefined;
    if (prompts?.[key]?.trim()) {
      return prompts[key].trim();
    }

    throw new Error(`No effective prompt found for key "${key}"`);
  } catch {
    throw new Error(`Failed to load prompt for key "${key}"`);
  }
}
