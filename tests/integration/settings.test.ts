/**
 * @file Settings API integration tests.
 *
 * Tests:
 * - GET /api/admin/settings returns default settings
 * - PUT /api/admin/settings updates settings
 * - After PUT, GET returns merged settings
 * - Partial update preserves other fields
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";

const CUSTOM_PATH = path.join(process.cwd(), "config/custom-settings.json");
const DEFAULT_PATH = path.join(process.cwd(), "config/default-settings.json");

// We test the module directly since it requires fs access
import { getSettings, updateSettings } from "../../config/settings";

describe("Settings API", () => {
  beforeAll(async () => {
    // Remove custom settings if exists
    try {
      await fs.unlink(CUSTOM_PATH);
    } catch {
      // ignore
    }
  });

  afterAll(async () => {
    // Cleanup
    try {
      await fs.unlink(CUSTOM_PATH);
    } catch {
      // ignore
    }
  });

  it("returns default settings when no custom file exists", async () => {
    const settings = await getSettings();
    expect(settings.site.title).toBe("Miniese's Blog");
    expect(settings.pagination.articlesPerPage).toBe(10);
    expect(settings.appearance.primary.lightHue).toBe(200);
    expect(settings.features.aiReview).toBe(true);
    // Prompts are now in default-settings.json, so they should contain content
    expect(settings.prompts.review).toContain("技术编辑");
    expect(settings.prompts.review).toContain("{{content}}");
  });

  it("updates a single field and persists", async () => {
    const updated = await updateSettings({
      site: { title: "My Blog", description: "Test", headerTitle: "My Blog" },
    });

    expect(updated.site.title).toBe("My Blog");
    expect(updated.site.description).toBe("Test");

    // Other fields should still be defaults
    expect(updated.pagination.articlesPerPage).toBe(10);
    expect(updated.appearance.primary.lightHue).toBe(200);
  });

  it("getSettings returns merged settings after update", async () => {
    const settings = await getSettings();

    // Custom values
    expect(settings.site.title).toBe("My Blog");

    // Default values (not overwritten)
    expect(settings.pagination.wikiPerPage).toBe(20);
    expect(settings.features.rss).toBe(true);
  });

  it("partial update merges with existing custom settings", async () => {
    // Update only appearance
    await updateSettings({
      appearance: {
        themeMode: "dark",
        bodyWidth: 80,
        image: { maxWidth: 800, maxHeight: 600, defaultWidthRatio: 60, lightboxEnabled: true },
        primary: { lightHue: 210, darkHue: 250, lightSaturation: 65, darkSaturation: 65, lightLightness: 55, darkLightness: 65 },
        accent: { lightHue: 300, darkHue: 290, lightSaturation: 60, darkSaturation: 60, lightLightness: 55, darkLightness: 65 },
        backgroundImage: "",
        backgroundOpacity: 20,
        markdownBgOpacity: 30,
        markdownTextColorLight: "#1f2328",
        markdownTextColorDark: "#f0f6fc",
        markdownBgColorLight: "#ffffff",
        markdownBgColorDark: "#0d1117",
      },
    });

    const settings = await getSettings();

    // Previous custom site title should persist
    expect(settings.site.title).toBe("My Blog");

    // New appearance values
    expect(settings.appearance.themeMode).toBe("dark");
    expect(settings.appearance.bodyWidth).toBe(80);
    expect(settings.appearance.primary.lightHue).toBe(210);
    expect(settings.appearance.markdownBgOpacity).toBe(30);
  });

  it("handles nested partial updates correctly", async () => {
    // Update only features
    await updateSettings({
      features: { aiReview: false, comments: false },
    });

    const settings = await getSettings();

    // Updated features
    expect(settings.features.aiReview).toBe(false);
    expect(settings.features.comments).toBe(false);

    // Other features unchanged
    expect(settings.features.rss).toBe(true);
    expect(settings.features.autoTranslate).toBe(true);

    // Previous settings preserved
    expect(settings.site.title).toBe("My Blog");
    expect(settings.appearance.themeMode).toBe("dark");
  });

  it("empty prompt strings do not override the default prompt templates", async () => {
    // Try to "reset" prompt by saving empty strings
    await updateSettings({
      prompts: { review: "", translate: "", discovery: "", generate: "" },
    });

    const settings = await getSettings();

    // Default prompt content should still be intact
    expect(settings.prompts.review).toContain("技术编辑");
    expect(settings.prompts.review).toContain("{{content}}");
    expect(settings.prompts.translate).toContain("翻译为 {{targetLang}}");
    expect(settings.prompts.discovery).toContain("技术文档分析专家");
    expect(settings.prompts.generate).toContain("技术百科编辑");

    // Other settings unaffected
    expect(settings.site.title).toBe("My Blog");
    expect(settings.appearance.themeMode).toBe("dark");
  });
});
