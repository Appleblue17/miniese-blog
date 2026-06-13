/**
 * @file promptLoader.ts — Loads custom prompts from site settings.
 *
 * The settings system stores custom prompt overrides in the `prompts` field
 * of AppSettings. If a custom prompt is set, it overrides the built-in default.
 * If empty string, the built-in default is used.
 */

import { getSettings } from "../../../config/settings";

/**
 * Loads a custom prompt override from the site settings.
 * Returns the custom prompt if set (non-empty), or `null` if no override exists.
 *
 * @param key - The prompt key (e.g., "review", "translate", "discovery", "generate")
 * @returns The custom prompt string, or null if not set
 */
export async function loadCustomPrompt(key: string): Promise<string | null> {
  try {
    const settings = await getSettings();
    const val = settings.prompts[key];
    if (val && val.trim()) {
      return val.trim();
    }
    return null;
  } catch {
    return null;
  }
}
