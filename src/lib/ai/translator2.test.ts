/**
 * @file Tests for the line-level incremental translation engine (translator2).
 *
 * v2 uses detectChanges for line-level diff, then assembles output by
 * replacing lines in the newLines array. No chunk-based assembly.
 *
 * Mock responses must include [TRANSLATE_START]/[TRANSLATE_END] markers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { incrementalTranslate, translateFull } from "./translator2";

// Mock the DeepSeek client
vi.mock("./client", () => ({
  callDeepSeek: vi.fn(),
}));

import { callDeepSeek } from "./client";
import type { Mock } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
  (callDeepSeek as Mock).mockReset();
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockTranslateResponse(translated: string): void {
  (callDeepSeek as Mock).mockResolvedValue({
    content: `[TRANSLATE_START]\n${translated}\n[TRANSLATE_END]`,
    usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
  });
}

// ---------------------------------------------------------------------------
// incrementalTranslate
// ---------------------------------------------------------------------------

describe("incrementalTranslate", () => {
  it("returns empty result for empty content", async () => {
    const result = await incrementalTranslate("", "", {}, "Chinese", "English");

    expect(result.translatedContent).toBe("");
    expect(result.translatedCount).toBe(0);
    expect(result.reusedCount).toBe(0);
    expect(result.totalTokensUsed).toBe(0);
    expect(result.translations).toEqual({});
    expect(result.translatedGroups).toEqual([]);
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  it("returns frontmatter-only when body is empty", async () => {
    const content = "---\ntitle: Test\n---";
    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(result.translatedContent).toBe("---\ntitle: Test\n---");
    expect(result.translatedCount).toBe(0);
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  it("returns frontmatter-only when body is whitespace", async () => {
    const content = "---\ntitle: Test\n---\n\n   \n\n  ";
    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(result.translatedContent).toBe("---\ntitle: Test\n---");
    expect(result.translatedCount).toBe(0);
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  it("preserves frontmatter in translated output", async () => {
    const content = [
      "---",
      "title: Test Article",
      "lang: zh",
      "---",
      "",
      "# Hello",
      "",
      "Small content.",
    ].join("\n");

    mockTranslateResponse("# Hello (translated)\n\nSmall content.");

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(result.translatedContent).toContain("---");
    expect(result.translatedContent).toContain("title: Test Article");
    expect(result.translatedContent).toContain("# Hello (translated)");
  });

  it("reuses existing translation when content unchanged (no diff blocks)", async () => {
    const content = ["# Stable", "", "Short content."].join("\n");

    // existingTranslations maps each LINE's content to its translation
    const existing = {
      "# Stable": "# Stable (translated)",
      "": "",
      "Short content.": "Short content (translated).",
    };

    const result = await incrementalTranslate(content, content, existing, "Chinese", "English");

    expect(callDeepSeek).not.toHaveBeenCalled();
    expect(result.translatedCount).toBe(0);
    expect(result.reusedCount).toBe(3); // all 3 lines (incl. blank) have translations
    expect(result.translatedContent).toBe("# Stable (translated)\n\nShort content (translated).");
    expect(result.translatedGroups).toEqual([]);
  });

  it("full translate: all content is new, calls AI once", async () => {
    const content = ["# Intro", "", "Short content."].join("\n");

    // When old is empty, detectChanges returns 1 block covering all lines.
    // splitRange produces 1 sub-chunk with the whole body.
    // AI call for that sub-chunk.
    mockTranslateResponse("# Intro (translated)\n\nShort content.");

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.reusedCount).toBe(0);
    expect(result.totalTokensUsed).toBe(60);
    expect(result.translatedContent).toContain("# Intro (translated)");
    expect(result.translatedContent).toContain("Short content.");
    // translatedGroups should report the sub-chunk's line range and context
    expect(result.translatedGroups).toHaveLength(1);
    expect(result.translatedGroups[0].targetLines).toEqual([1, 3]);
  });

  it("partial change: only changed line range is sent to AI", async () => {
    const oldContent = [
      "# Stable",
      "",
      "This part does not change.",
      "",
      "## Changed Section",
      "",
      "Old text.",
    ].join("\n");

    const newContent = [
      "# Stable",
      "",
      "This part does not change.",
      "",
      "## Changed Section",
      "",
      "New text.",
    ].join("\n");

    // Line 7 changed: "Old text." → "New text."
    // Lines 1-6 unchanged.
    // Unchanged lines: 1-6. Each line checked against existingTranslations.
    // Changed: line 7 → splitRange([7,7]) → 1 sub-chunk "New text."
    // AI translates "New text." → return marker-wrapped result

    mockTranslateResponse("New text (translated).");

    const result = await incrementalTranslate(oldContent, newContent, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.translatedContent).toContain("# Stable");
    expect(result.translatedContent).toContain("This part does not change.");
    expect(result.translatedContent).toContain("## Changed Section");
    expect(result.translatedContent).toContain("New text (translated).");
    expect(result.translatedContent).not.toContain("Old text.");
    expect(result.translatedContent).not.toContain("New text."); // original replaced
  });

  it("partial change with existing translations: reuses unchanged lines", async () => {
    const oldContent = [
      "# Stable",
      "",
      "Same content.",
      "",
      "## Changed Section",
      "",
      "Old text.",
    ].join("\n");

    const newContent = [
      "# Stable",
      "",
      "Same content.",
      "",
      "## Changed Section",
      "",
      "New text.",
    ].join("\n");

    // existingTranslations: line-by-line translations
    const existing = {
      "# Stable": "# Stable (translated)",
      "Same content.": "Same content (translated).",
      "## Changed Section": "## Changed Section (translated)",
    };

    mockTranslateResponse("New text (translated).");

    const result = await incrementalTranslate(
      oldContent,
      newContent,
      existing,
      "Chinese",
      "English",
    );

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    // reused lines: "# Stable", "Same content.", "## Changed Section" (3 non-empty)
    expect(result.reusedCount).toBe(3);
    expect(result.translatedContent).toContain("# Stable (translated)");
    expect(result.translatedContent).toContain("Same content (translated).");
    expect(result.translatedContent).toContain("## Changed Section (translated)");
    expect(result.translatedContent).toContain("New text (translated).");
  });

  it("handles added content at the end", async () => {
    const oldContent = ["# Intro", "", "Intro text."].join("\n");

    const newContent = [
      "# Intro",
      "",
      "Intro text.",
      "",
      "## Added Section",
      "",
      "New content.",
    ].join("\n");

    // Lines 1-3 unchanged. Lines 4-7 added (diff block).
    // splitRange on [4,7] → should produce sub-chunks based on heading boundaries.
    // The diff block covers lines 4-7: ["", "## Added Section", "", "New content."]
    // splitRange will split by heading "## Added Section" (line 5).
    // Sub-chunk 1: lines 4 (the blank line)
    // Sub-chunk 2: lines 5-7 ("## Added Section\n\nNew content.")
    //
    // Actually splitRange behavior: it splits the range by heading boundaries.
    // Line 4 = "" (no heading), line 5 = "## Added Section" (heading).
    // The sections within [4,7] are: section 1 = line 4 only, section 2 = lines 5-7.
    // Then it merges into chunks with size guards.
    // Since the total range is small (≤8000), it returns as 1 chunk.
    // So 1 sub-chunk with content = "\n## Added Section\n\nNew content."
    //
    // That's the content of lines 4-7. AI translates the whole thing,
    // then replaceLines replaces lines 4-7 with the translation result.

    mockTranslateResponse("\n## Added Section (translated)\n\nNew content (translated).");

    const result = await incrementalTranslate(oldContent, newContent, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.translatedContent).toContain("# Intro");
    expect(result.translatedContent).toContain("Intro text.");
    expect(result.translatedContent).toContain("## Added Section (translated)");
    expect(result.translatedContent).toContain("New content (translated).");
  });

  it("handles removed content by excluding it from output", async () => {
    const oldContent = [
      "# Keep",
      "",
      "Content to keep.",
      "",
      "## Remove",
      "",
      "Content to remove.",
    ].join("\n");

    const newContent = ["# Keep", "", "Content to keep."].join("\n");

    // newContent only has 3 lines. oldContent had 7.
    // detectChanges: lines 1-3 match, lines 4-7 removed from old (no mapping to new).
    // Since no lines are ADDED in new, changedInNew is empty.
    // diffBlocks = [] → early return.
    // Unchanged content with existing translations.

    const existing = {
      "# Keep": "# Keep (translated)",
      "Content to keep.": "Content to keep (translated).",
    };

    const result = await incrementalTranslate(
      oldContent,
      newContent,
      existing,
      "Chinese",
      "English",
    );

    expect(callDeepSeek).not.toHaveBeenCalled();
    expect(result.translatedCount).toBe(0);
    expect(result.reusedCount).toBe(2);
    expect(result.translatedContent).toContain("# Keep (translated)");
    expect(result.translatedContent).toContain("Content to keep (translated).");
    expect(result.translatedContent).not.toContain("Remove");
  });

  it("translates entire content when old is empty (full translate via incremental)", async () => {
    const content = ["# Section 1", "", "Content 1.", "", "# Section 2", "", "Content 2."].join(
      "\n",
    );

    mockTranslateResponse(
      "# Section 1 (translated)\n\nContent 1.\n\n# Section 2 (translated)\n\nContent 2.",
    );

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.translatedContent).toContain("# Section 1 (translated)");
    expect(result.translatedContent).toContain("# Section 2 (translated)");
  });

  it("fallback when translated chunk returns empty content", async () => {
    const content = ["# Section 1", "", "Content 1."].join("\n");

    mockTranslateResponse("");

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    // Fallback: original content preserved
    expect(result.translatedContent).toContain("# Section 1");
    expect(result.translatedContent).toContain("Content 1.");
  });

  it("handles content with no headings", async () => {
    const content = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

    mockTranslateResponse("First (translated)\n\nSecond (translated)\n\nThird (translated)");

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.translatedContent).toContain("First (translated)");
    expect(result.translatedContent).toContain("Second (translated)");
    expect(result.translatedContent).toContain("Third (translated)");
  });

  it("handles single-word content", async () => {
    const content = "# Hi";

    mockTranslateResponse("# Hi (translated)");

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.translatedContent).toContain("# Hi (translated)");
  });

  it("handles content with code blocks", async () => {
    const content = ["# Code", "", "```python", 'print("hello")', "```", "", "Some text."].join(
      "\n",
    );

    mockTranslateResponse('# Code (translated)\n\n```python\nprint("hello")\n```\n\nSome text.');

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.translatedContent).toContain("# Code (translated)");
    expect(result.translatedContent).toContain('print("hello")');
  });

  it("reuses lines from existing translations even when content is not chunk-aligned", async () => {
    // This tests the core fix: previously, unchanged lines could be lost
    // because assembly used chunk-level keys. Now assembly is line-level.
    const oldContent = ["# A", "", "A content."].join("\n");

    const newContent = ["# A", "", "A content.", "", "# B", "", "B content."].join("\n");

    // Line-by-line existing translations
    const existing = {
      "# A": "# A (translated)",
      "A content.": "A content (translated).",
    };

    // Lines 4-6 are new (the "# B" section). Lines 1-3 unchanged.
    // unchanged lines 1-3 → reused from existingTranslations
    // changed lines 4-6 → AI translates
    mockTranslateResponse("\n# B (translated)\n\nB content (translated).");

    const result = await incrementalTranslate(
      oldContent,
      newContent,
      existing,
      "Chinese",
      "English",
    );

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.reusedCount).toBe(2);
    expect(result.translatedContent).toContain("# A (translated)");
    expect(result.translatedContent).toContain("A content (translated).");
    expect(result.translatedContent).toContain("# B (translated)");
    expect(result.translatedContent).toContain("B content (translated).");
  });

  it("preserves document order in translated output", async () => {
    const content = ["# Z Section", "", "Content Z.", "", "# A Section", "", "Content A."].join(
      "\n",
    );

    mockTranslateResponse(
      "# Z Section (translated)\n\nContent Z.\n\n# A Section (translated)\n\nContent A.",
    );

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    const zPos = result.translatedContent.indexOf("Z Section (translated)");
    const aPos = result.translatedContent.indexOf("A Section (translated)");
    expect(zPos).toBeLessThan(aPos);
  });
});

// ---------------------------------------------------------------------------
// translateFull
// ---------------------------------------------------------------------------

describe("translateFull", () => {
  it("translates all content as new", async () => {
    const content = ["# Hello", "", "Hello world."].join("\n");

    mockTranslateResponse("# Hello (translated)\n\nHello world.");

    const result = await translateFull(content, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.reusedCount).toBe(0);
    expect(result.translatedContent).toContain("# Hello (translated)");
  });

  it("returns empty for empty content", async () => {
    const result = await translateFull("", "Chinese", "English");
    expect(result.translatedContent).toBe("");
    expect(result.translatedCount).toBe(0);
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  it("handles content with only frontmatter", async () => {
    const content = "---\ntitle: Test\n---";
    const result = await translateFull(content, "Chinese", "English");
    expect(result.translatedContent).toBe("---\ntitle: Test\n---");
    expect(result.translatedCount).toBe(0);
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  it("preserves frontmatter in full translation", async () => {
    const content = ["---", "title: Hello", "---", "", "# Content", "", "Body text."].join("\n");

    mockTranslateResponse("# Content (translated)\n\nBody text.");

    const result = await translateFull(content, "Chinese", "English");

    expect(result.translatedContent).toMatch(/^---\ntitle: Hello\n---/);
    expect(result.translatedContent).toContain("# Content (translated)");
  });

  it("provides correct translatedGroups for full translation", async () => {
    const content = ["# Section 1", "", "Content 1."].join("\n");

    mockTranslateResponse("# Section 1 (translated)\n\nContent 1.");

    const result = await translateFull(content, "Chinese", "English");

    expect(result.translatedGroups).toHaveLength(1);
    expect(result.translatedGroups[0].targetLines).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles content with single line", async () => {
    const content = "Just one line.";

    mockTranslateResponse("Just one line (translated).");

    const result = await incrementalTranslate("", content, {}, "Chinese", "English");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.translatedCount).toBe(1);
    expect(result.translatedContent).toContain("Just one line (translated).");
  });

  it("does not call API when all content is unchanged and has translations", async () => {
    const content = ["# A", "", "A content."].join("\n");

    const existing = {
      "# A": "# A (translated)",
      "": "",
      "A content.": "A content (translated).",
    };

    const result = await incrementalTranslate(content, content, existing, "Chinese", "English");

    expect(callDeepSeek).not.toHaveBeenCalled();
    expect(result.translatedCount).toBe(0);
    expect(result.reusedCount).toBe(3);
    expect(result.translatedContent).toBe("# A (translated)\n\nA content (translated).");
  });

  it("reuses unchanged lines after full-translate when existingTranslations has full-content keys", async () => {
    // Simulates the real-world scenario:
    // 1. First translation (full) stores entire body as a single key
    // 2. User edits a small part → incrementalTranslate with that large key

    const oldContent = [
      "# Hello",
      "",
      "This is the first paragraph.",
      "",
      "## Section 2",
      "",
      "This is the second section.",
      "",
      "## Section 3",
      "",
      "Final content here.",
    ].join("\n");

    const newContent = [
      "# Hello",
      "",
      "This is the first paragraph.",
      "",
      "## Section 2",
      "",
      "This is the second section (edited).",
      "",
      "## Section 3",
      "",
      "Final content here.",
    ].join("\n");
    // Line 7 changed: "This is the second section." → "This is the second section (edited)."
    // Lines 1-6, 8-11 unchanged.

    // existingTranslations from a full-translate: the entire body is one key
    const existing: Record<string, string> = {};
    existing[oldContent] = [
      "# Hello (translated)",
      "",
      "This is the first paragraph (translated).",
      "",
      "## Section 2 (translated)",
      "",
      "This is the second section (translated).",
      "",
      "## Section 3 (translated)",
      "",
      "Final content here (translated).",
    ].join("\n");

    mockTranslateResponse("This is the second section (translated and edited).");

    const result = await incrementalTranslate(
      oldContent,
      newContent,
      existing,
      "Chinese",
      "English",
    );

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    // 11 total lines in body, minus 1 changed line (line 7) = 10 unchanged lines.
    // All 10 have matches in lineToTranslation because the single multi-line key
    // was split and mapped line-by-line (including blank lines).
    expect(result.reusedCount).toBe(10);
    expect(result.translatedCount).toBe(1);

    // Verify output contains translated reused content
    expect(result.translatedContent).toContain("# Hello (translated)");
    expect(result.translatedContent).toContain("This is the first paragraph (translated).");
    expect(result.translatedContent).toContain("## Section 2 (translated)");
    expect(result.translatedContent).toContain("## Section 3 (translated)");
    expect(result.translatedContent).toContain("Final content here (translated).");

    // Verify the edited part was translated
    expect(result.translatedContent).toContain(
      "This is the second section (translated and edited).",
    );
    expect(result.translatedContent).not.toContain("This is the second section (edited)."); // original
  });
});
