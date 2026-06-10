import { describe, it, expect } from "vitest";
import { parseFrontmatter, generateSlug } from "./frontmatter";

// ============================================================================
// parseFrontmatter tests
// ============================================================================

describe("parseFrontmatter", () => {
  it("parses full frontmatter with all fields", () => {
    const raw = `---
title: "My Article"
slug: my-article
language: zh
tags: [tech, react]
summary: "A short summary"
author: "Miniese"
accessGroup: []
changelog: "Initial publish"
contentType: "markdown"
---

Article body here.`;

    const result = parseFrontmatter(raw);
    expect(result.frontmatter.title).toBe("My Article");
    expect(result.frontmatter.slug).toBe("my-article");
    expect(result.frontmatter.language).toBe("zh");
    expect(result.frontmatter.tags).toEqual(["tech", "react"]);
    expect(result.frontmatter.summary).toBe("A short summary");
    expect(result.frontmatter.author).toBe("Miniese");
    expect(result.frontmatter.accessGroup).toEqual([]);
    expect(result.frontmatter.changelog).toBe("Initial publish");
    expect(result.frontmatter.contentType).toBe("markdown");
    expect(result.content.trim()).toBe("Article body here.");
  });

  it("parses minimal frontmatter with only title", () => {
    const raw = `---
title: "Minimal"
---

Content`;

    const result = parseFrontmatter(raw);
    expect(result.frontmatter.title).toBe("Minimal");
    expect(result.content.trim()).toBe("Content");
  });

  it("handles markdown without frontmatter", () => {
    const raw = "# Just a heading\n\nSome content.";
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.title).toBeUndefined();
    expect(result.content.trim()).toBe("# Just a heading\n\nSome content.");
  });

  it("returns empty content for frontmatter-only input", () => {
    const raw = `---
title: "Only Meta"
---`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.title).toBe("Only Meta");
    expect(result.content.trim()).toBe("");
  });

  it("handles empty input", () => {
    const result = parseFrontmatter("");
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe("");
  });

  it("parses tags as array from YAML list", () => {
    const raw = `---
title: "Tags"
tags:
  - a
  - b
  - c
---

Body`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.tags).toEqual(["a", "b", "c"]);
  });

  it("parses numeric values in frontmatter", () => {
    const raw = `---
title: "Version"
version: 2
---

Body`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.title).toBe("Version");
    // Extra fields not in interface are still accessible
    expect((result.frontmatter as Record<string, unknown>).version).toBe(2);
  });
});

// ============================================================================
// generateSlug tests
// ============================================================================

describe("generateSlug", () => {
  it("generates slug from English title", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  it("generates slug from title with special characters", () => {
    expect(generateSlug("My Article! @2024 #beta")).toBe("my-article-2024-beta");
  });

  it("preserves existing slug when provided", () => {
    expect(generateSlug("Any Title", "custom-slug")).toBe("custom-slug");
  });

  it("handles Chinese title (preserves characters)", () => {
    expect(generateSlug("你好世界")).toBe("你好世界");
  });

  it("handles mixed Chinese and English title", () => {
    expect(generateSlug("Hello 世界")).toBe("hello-世界");
  });

  it("strips leading and trailing hyphens", () => {
    expect(generateSlug("!Hello!!")).toBe("hello");
  });

  it("reduces multiple hyphens to single hyphen", () => {
    expect(generateSlug("Hello   World---Test")).toBe("hello-world-test");
  });

  it("handles empty title gracefully", () => {
    expect(generateSlug("")).toBe("");
  });

  it("returns existing slug even when it contains Chinese", () => {
    expect(generateSlug("Hello", "自定义-slug")).toBe("自定义-slug");
  });
});
