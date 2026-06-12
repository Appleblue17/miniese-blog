/**
 * @file Tests for article content chunker.
 */

import { describe, it, expect } from "vitest";
import { splitArticle } from "./chunker";

describe("splitArticle", () => {
  it("returns single chunk for short content", () => {
    const content = `# Hello World

This is a test.`;

    const chunks = splitArticle(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("# Hello World");
    expect(chunks[0].content).toContain("Hello World");
    expect(chunks[0].content).toContain("This is a test.");
    expect(chunks[0].startLine).toBe(1);
  });

  it("returns single chunk for content with frontmatter", () => {
    const content = `---
title: Test
---

# Hello World

Short content.`;

    const chunks = splitArticle(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe("# Hello World");
    expect(chunks[0].content).not.toContain("title:");
  });

  it("returns single chunk for short content with multiple headings", () => {
    // When total content ≤ MAX_CHUNK_SIZE, the whole article is returned
    // as a single chunk regardless of heading boundaries
    const content = `# Section 1
Small content here.

# Section 2
Another small section.

# Section 3
Yet another small bit.`;

    const chunks = splitArticle(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Section 1");
    expect(chunks[0].content).toContain("Section 2");
    expect(chunks[0].content).toContain("Section 3");
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(8);
  });

  it("splits at heading boundaries when sections are large enough", () => {
    // Build content with 2 large h1 sections (each > 8000 chars)
    const longLine = "Long content line here. ";
    const bigSection = Array(320).fill(longLine).join("\n");
    const content = `# Big Section 1
${bigSection}

# Big Section 2
${bigSection}`;

    const chunks = splitArticle(content);

    // Each section is > 8000 chars, so each gets split into ~3 sub-chunks
    // The first chunk from each section retains its heading
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks[0].content).toContain("Big Section 1");
    // Big Section 2 starts after Big Section 1's sub-chunks
    const bigSection2Chunk = chunks.find((c) => c.title.includes("Big Section 2"));
    expect(bigSection2Chunk).toBeDefined();
    expect(bigSection2Chunk!.content).toContain("Big Section 2");
  });

  it("splits an oversized single section by paragraphs", () => {
    const para = "Paragraph one content here. ";
    const content = `# Very Long Section
${Array(50).fill(Array(30).fill(para).join(" ")).join("\n\n")}`;

    const chunks = splitArticle(content);

    // Should be split into multiple chunks at paragraph boundaries
    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should be under MAX_CHUNK_SIZE
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(8000);
    }
  });

  it("handles nested headings (h1 + h2)", () => {
    const longLine = "Content here. ";
    const bigSection = Array(320).fill(longLine).join("\n");
    const content = `# Main Title
Introductory paragraph.

## Section A
${bigSection}

## Section B
${bigSection}`;

    const chunks = splitArticle(content);

    // h2 sections are > 8000 → separate chunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk contains the h1 title
    expect(chunks[0].title).toBe("# Main Title");
  });

  it("preserves heading in oversized section split", () => {
    const para = "Body paragraph content here. ";
    const content = `# The Heading
${Array(40).fill(Array(50).fill(para).join(" ")).join("\n\n")}`;

    const chunks = splitArticle(content);

    // Should be split, first chunk retains the heading
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content).toContain("# The Heading");
  });

  it("handles empty content", () => {
    const chunks = splitArticle("");
    expect(chunks).toHaveLength(0);
  });

  it("handles content with no headings", () => {
    const para = "Long paragraph content here for testing. ";
    const content = Array(60).fill(Array(50).fill(para).join(" ")).join("\n\n");

    const chunks = splitArticle(content);

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be reasonably sized
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.content.length).toBeLessThanOrEqual(8000);
    }
  });

  it("assigns correct line numbers", () => {
    const longLine = "Line of content.\n";
    const content = `# First
${Array(320).fill(longLine).join("")}
# Second
${Array(320).fill(longLine).join("")}`;

    const chunks = splitArticle(content);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBeLessThan(chunks[1].startLine);
    expect(chunks[1].endLine).toBeGreaterThan(chunks[1].startLine);
  });

  it("assigns unique sequential IDs", () => {
    const longLine = "Content line.\n";
    const content = `# A
${Array(320).fill(longLine).join("")}
# B
${Array(320).fill(longLine).join("")}
# C
${Array(320).fill(longLine).join("")}`;

    const chunks = splitArticle(content);

    const ids = chunks.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(chunks.length);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].id).toBe(i);
    }
  });

  it("uses meaningful titles for chunks", () => {
    const longLine = "Content line here.\n";
    const content = `# Introduction
${Array(320).fill(longLine).join("")}
# Methodology
${Array(320).fill(longLine).join("")}`;

    const chunks = splitArticle(content);

    // Each section is > 8000 chars, so each is split into sub-chunks.
    // The first sub-chunk of each section retains its heading as title.
    const introChunk = chunks.find((c) => c.title.includes("Introduction"));
    const methodologyChunk = chunks.find((c) => c.title.includes("Methodology"));
    expect(introChunk).toBeDefined();
    expect(methodologyChunk).toBeDefined();
  });
});
