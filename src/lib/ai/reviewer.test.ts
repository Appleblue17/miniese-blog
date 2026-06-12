/**
 * @file Tests for the line-level incremental review engine (reviewer.ts).
 *
 * Tests cover:
 * - Empty content / frontmatter-only handling
 * - Full review (first run, no old content)
 * - Incremental review with changed lines
 * - Content map reuse (exact match and line-level fallback)
 * - Line-level fallback when chunk boundaries change between runs
 * - No changes path
 * - Edge cases (single line, code blocks, etc.)
 * - Merge chunks from multiple sources
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { incrementalReview, type ReviewChunk } from "./reviewer";
import type { ReviewReport } from "../../types/ai";

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

/**
 * Mock a review response that finds one issue.
 */
function mockReviewResponse(): void {
  const report: ReviewReport = {
    sections: [
      {
        type: "typo",
        title: "Typographical Issues",
        items: [
          {
            severity: "warning",
            lineStart: 1,
            lineEnd: 1,
            snippet: "mock snippet",
            issue: "AI found an issue",
            suggestion: "Fix it",
          },
        ],
      },
    ],
  };
  (callDeepSeek as Mock).mockResolvedValue({
    content: JSON.stringify(report),
    usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
  });
}

/**
 * Mock a review response with no issues found.
 */
function mockCleanReviewResponse(): void {
  const report: ReviewReport = { sections: [] };
  (callDeepSeek as Mock).mockResolvedValue({
    content: JSON.stringify(report),
    usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
  });
}

// ---------------------------------------------------------------------------
// incrementalReview
// ---------------------------------------------------------------------------

describe("incrementalReview", () => {
  // -----------------------------------------------------------------------
  // Empty / edge cases
  // -----------------------------------------------------------------------

  it("returns empty result for empty content", async () => {
    const result = await incrementalReview("", "", {}, "article-1", "1.0");

    expect(result.chunks).toEqual([]);
    expect(result.groups).toEqual([]);
    expect(result.summary.totalIssues).toBe(0);
    expect(result.reviewedCount).toBe(0);
    expect(result.reusedCount).toBe(0);
    expect(result.totalTokensUsed).toBe(0);
    expect(result.contentSnapshot).toBe("");
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  it("returns empty result for whitespace-only content", async () => {
    const result = await incrementalReview("", "   \n\n  ", {}, "article-1", "1.0");

    expect(result.chunks).toEqual([]);
    expect(result.reviewedCount).toBe(0);
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  it("returns frontmatter-only when body is empty", async () => {
    const content = "---\ntitle: Test\n---";
    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(result.chunks).toEqual([]);
    expect(result.reviewedCount).toBe(0);
    expect(result.contentSnapshot).toBe("");
    expect(callDeepSeek).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Full review (first run, no old content)
  // -----------------------------------------------------------------------

  it("full review: reviews all content when old is empty", async () => {
    const content = [
      "# Hello",
      "",
      "This is some content.",
    ].join("\n");

    mockReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.reviewedCount).toBe(1);
    expect(result.reusedCount).toBe(0);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].sections).toHaveLength(1);
    expect(result.chunks[0].sections[0].items[0].issue).toBe("AI found an issue");
    expect(result.contentSnapshot).toBe(content);
    // contentMap should have the reviewed chunk
    expect(Object.keys(result.contentMap)).toHaveLength(1);
  });

  it("full review: stores content snapshot for next incremental run", async () => {
    const content = [
      "# Section 1",
      "",
      "Content 1.",
      "",
      "# Section 2",
      "",
      "Content 2.",
    ].join("\n");

    mockCleanReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(result.contentSnapshot).toBe(content);
    expect(result.chunks).toHaveLength(1); // small content → 1 chunk
  });

  it("full review: handles two heading sections as separate chunks when large", async () => {
    // Create content large enough to split into multiple chunks
    const lines: string[] = ["# Big Section 1"];
    for (let i = 0; i < 200; i++) {
      lines.push(`Paragraph ${i} with some padding text to make it larger.`);
    }
    lines.push("");
    lines.push("# Big Section 2");
    for (let i = 0; i < 200; i++) {
      lines.push(`Paragraph ${i} in the second section with padding.`);
    }
    const content = lines.join("\n");

    mockCleanReviewResponse();
    // Each call should be answered
    (callDeepSeek as Mock).mockResolvedValue({
      content: JSON.stringify({ sections: [] }),
      usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 },
    });

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    // Should produce multiple sub-chunks
    expect(callDeepSeek).toHaveBeenCalled();
    expect(result.reviewedCount).toBeGreaterThanOrEqual(1);
    expect(result.contentSnapshot).toBe(content);
    // contentMap should have entries for each sub-chunk
    expect(Object.keys(result.contentMap).length).toBe(result.reviewedCount);
  });

  // -----------------------------------------------------------------------
  // Incremental review — exact content map match
  // -----------------------------------------------------------------------

  it("incremental: reuses chunk from contentMap when boundaries match exactly", async () => {
    const oldBody = [
      "# Stable",
      "",
      "Unchanged content.",
      "",
      "## Changed",
      "",
      "Old text.",
    ].join("\n");

    const newBody = [
      "# Stable",
      "",
      "Unchanged content.",
      "",
      "## Changed",
      "",
      "New text.",
    ].join("\n");
    // Line 7 changed: "Old text." → "New text."

    // Simulate a previous review that stored contentMap with the old body
    // The exact content of lines 1-4 ("# Stable\n\nUnchanged content.") was
    // one chunk, and "## Changed\n\nOld text." was another chunk.
    const existingChunkUnchanged: ReviewChunk = {
      chunkId: 0,
      chunkTitle: "# Stable",
      startLine: 1,
      endLine: 4,
      sections: [
        {
          type: "clarity",
          title: "Clarity",
          items: [
            {
              severity: "suggestion",
              lineStart: 1,
              lineEnd: 1,
              snippet: "# Stable",
              issue: "Consider a more descriptive title",
              suggestion: "Add context to heading",
            },
          ],
        },
      ],
    };

    const existingChunkOld: ReviewChunk = {
      chunkId: 1,
      chunkTitle: "## Changed",
      startLine: 5,
      endLine: 7,
      sections: [
        {
          type: "typo",
          title: "Typos",
          items: [
            {
              severity: "warning",
              lineStart: 7,
              lineEnd: 7,
              snippet: "Old text.",
              issue: "Use active voice",
              suggestion: "Consider rewording",
            },
          ],
        },
      ],
    };

    const existingMap: Record<string, ReviewChunk> = {};

    // Store by the exact sub-chunk content that splitRange would produce
    // For unchanged section: "# Stable" heading section
    existingMap["# Stable\n\nUnchanged content."] = existingChunkUnchanged;
    // For changed section: "## Changed" heading section (with old text)
    existingMap["## Changed\n\nOld text."] = existingChunkOld;

    mockReviewResponse(); // For the changed line 7

    const result = await incrementalReview(
      oldBody,
      newBody,
      existingMap,
      "article-1",
      "1.0",
    );

    // The unchanged chunk (# Stable section) should be reused
    // The changed sub-chunk (## Changed with "New text.") should not have
    // an exact match in contentMap (key was "## Changed\n\nOld text."),
    // so it gets re-reviewed by AI.
    // The unchanged range is lines 1-6, which splitRange merges into 1 sub-chunk.
    // Its content doesn't exactly match any key (different boundaries), but the
    // line-level fallback finds both chunks and merges them → 1 reused.
    expect(callDeepSeek).toHaveBeenCalledTimes(1); // only the changed part
    expect(result.reusedCount).toBe(1); // unchanged range merged into 1 chunk
    expect(result.reviewedCount).toBe(1);

    // Verify unchanged content's review items are preserved
    const allIssues = result.chunks.flatMap((c) =>
      c.sections.flatMap((s) => s.items.map((i) => i.issue)),
    );
    expect(allIssues).toContain("Consider a more descriptive title");
  });

  // -----------------------------------------------------------------------
  // Incremental review — line-level fallback (the critical fix)
  // -----------------------------------------------------------------------

  it("incremental: falls back to line-level lookup when chunk boundaries change", async () => {
    // This tests the core fix: after a full review where the entire body was
    // one key in contentMap, an edit should still reuse unchanged lines
    // via line-level lookup.

    const oldBody = [
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

    const newBody = [
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

    // Simulate a previous full review that stored the ENTIRE body as one key
    const existingMap: Record<string, ReviewChunk> = {};
    const fullReviewChunk: ReviewChunk = {
      chunkId: 0,
      chunkTitle: "# Hello",
      startLine: 1,
      endLine: 11,
      sections: [
        {
          type: "clarity",
          title: "Clarity",
          items: [
            {
              severity: "suggestion",
              lineStart: 1,
              lineEnd: 1,
              snippet: "# Hello",
              issue: "Review heading clarity",
              suggestion: "Make it more specific",
            },
            {
              severity: "suggestion",
              lineStart: 5,
              lineEnd: 5,
              snippet: "## Section 2",
              issue: "Add more detail to Section 2",
              suggestion: "Expand this section",
            },
          ],
        },
      ],
    };
    existingMap[oldBody] = fullReviewChunk;

    mockCleanReviewResponse(); // For the changed line 7

    const result = await incrementalReview(
      oldBody,
      newBody,
      existingMap,
      "article-1",
      "1.0",
    );

    // All unchanged lines should be found via line-level lookup:
    // multi-line key is split into individual lines, each line maps to
    // the fullReviewChunk. Then all chunks are merged.
    expect(callDeepSeek).toHaveBeenCalledTimes(1); // only the changed part
    expect(result.reviewedCount).toBe(1);
    // 10 unchanged lines out of 11 total body lines
    // Each unchanged line maps to the fullReviewChunk
    // But they all reference the same chunk, so reusedCount = number of
    // sub-chunks in unchanged ranges that have at least one matching line
    expect(result.reusedCount).toBeGreaterThan(0);

    // Verify the unchanged review items are preserved (via merge)
    const allIssues = result.chunks.flatMap((c) =>
      c.sections.flatMap((s) => s.items.map((i) => i.issue)),
    );
    expect(allIssues).toContain("Review heading clarity");
    expect(allIssues).toContain("Add more detail to Section 2");
  });

  it("incremental: reuses all unchanged content when only one line changes", async () => {
    const oldBody = [
      "# Stable Heading",
      "",
      "Stable paragraph 1.",
      "",
      "Stable paragraph 2.",
    ].join("\n");

    const newBody = [
      "# Stable Heading",
      "",
      "Stable paragraph 1.",
      "",
      "Stable paragraph 2 (edited).",
    ].join("\n");
    // Line 5 changed.

    // Store fine-grained content map keys
    const existingMap: Record<string, ReviewChunk> = {};
    existingMap["# Stable Heading"] = {
      chunkId: 0,
      chunkTitle: "# Stable Heading",
      startLine: 1,
      endLine: 1,
      sections: [
        {
          type: "other",
          title: "General",
          items: [
            {
              severity: "suggestion",
              lineStart: 1,
              lineEnd: 1,
              snippet: "# Stable Heading",
              issue: "Check heading",
              suggestion: "Verify heading",
            },
          ],
        },
      ],
    };
    existingMap[""] = {
      chunkId: 1,
      chunkTitle: "Content",
      startLine: 2,
      endLine: 5,
      sections: [],
    };

    mockCleanReviewResponse();

    const result = await incrementalReview(
      oldBody,
      newBody,
      existingMap,
      "article-1",
      "1.0",
    );

    // Expect at least one reused chunk
    expect(result.reusedCount).toBeGreaterThan(0);
    expect(result.reviewedCount).toBe(1);
    // The heading suggestion should be preserved
    const allIssues = result.chunks.flatMap((c) =>
      c.sections.flatMap((s) => s.items.map((i) => i.issue)),
    );
    expect(allIssues).toContain("Check heading");
  });

  // -----------------------------------------------------------------------
  // No changes path
  // -----------------------------------------------------------------------

  it("no changes: reuses all chunks when content is identical", async () => {
    const content = [
      "# Stable",
      "",
      "Same content.",
    ].join("\n");

    const existingMap: Record<string, ReviewChunk> = {};
    existingMap["# Stable\n\nSame content."] = {
      chunkId: 0,
      chunkTitle: "# Stable",
      startLine: 1,
      endLine: 3,
      sections: [
        {
          type: "typo",
          title: "Typos",
          items: [
            {
              severity: "warning",
              lineStart: 3,
              lineEnd: 3,
              snippet: "Same content.",
              issue: "Check spelling",
              suggestion: "Verify content",
            },
          ],
        },
      ],
    };

    const result = await incrementalReview(
      content,
      content,
      existingMap,
      "article-1",
      "1.0",
    );

    expect(callDeepSeek).not.toHaveBeenCalled();
    expect(result.reviewedCount).toBe(0);
    expect(result.reusedCount).toBeGreaterThan(0);
    expect(result.chunks.length).toBeGreaterThan(0);
    // Original review items should be preserved
    const allIssues = result.chunks.flatMap((c) =>
      c.sections.flatMap((s) => s.items.map((i) => i.issue)),
    );
    expect(allIssues).toContain("Check spelling");
  });

  it("no changes: falls back to line-level when exact match fails", async () => {
    const content = [
      "# Section A",
      "",
      "Content A.",
      "",
      "# Section B",
      "",
      "Content B.",
    ].join("\n");

    // Store with a different key structure (full body as one key)
    const existingMap: Record<string, ReviewChunk> = {};
    existingMap[content] = {
      chunkId: 0,
      chunkTitle: "# Section A",
      startLine: 1,
      endLine: 7,
      sections: [
        {
          type: "other",
          title: "General",
          items: [
            {
              severity: "suggestion",
              lineStart: 1,
              lineEnd: 1,
              snippet: "# Section A",
              issue: "Review title",
              suggestion: "Check title",
            },
          ],
        },
      ],
    };

    const result = await incrementalReview(
      content,
      content,
      existingMap,
      "article-1",
      "1.0",
    );

    expect(callDeepSeek).not.toHaveBeenCalled();
    // Even though the exact key doesn't match the splitRange output,
    // the line-level fallback should find individual lines
    expect(result.reusedCount).toBeGreaterThan(0);
    expect(result.chunks.length).toBeGreaterThan(0);
    // Original review items should be preserved
    const allIssues = result.chunks.flatMap((c) =>
      c.sections.flatMap((s) => s.items.map((i) => i.issue)),
    );
    expect(allIssues).toContain("Review title");
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("handles content with code blocks", async () => {
    const content = [
      "# Code Example",
      "",
      '```python',
      'print("hello")',
      '```',
      "",
      "Some text.",
    ].join("\n");

    mockReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.reviewedCount).toBe(1);
    expect(result.chunks.length).toBe(1);
  });

  it("handles single-line content", async () => {
    const content = "# Just a heading";

    mockReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.reviewedCount).toBe(1);
  });

  it("handles content with no headings", async () => {
    const content = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

    mockReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(callDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.reviewedCount).toBe(1);
  });

  it("preserves frontmatter in contentSnapshot (frontmatter is stripped from body)", async () => {
    const content = [
      "---",
      "title: Test",
      "---",
      "",
      "# Hello",
      "",
      "Body content.",
    ].join("\n");

    mockReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    // contentSnapshot should be without frontmatter
    expect(result.contentSnapshot).not.toContain("---");
    expect(result.contentSnapshot).toContain("# Hello");
    expect(result.contentSnapshot).toContain("Body content.");
  });

  it("populates groups for detail page rendering", async () => {
    const content = [
      "# Section 1",
      "",
      "Content 1.",
    ].join("\n");

    mockReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].targetLines).toEqual([1, 3]);
    expect(result.groups[0].contextLines[0]).toBeLessThanOrEqual(1);
    expect(result.groups[0].contextLines[1]).toBeGreaterThanOrEqual(3);
  });

  it("computes correct summary with multiple issues", async () => {
    const content = [
      "# Section 1",
      "",
      "Content 1.",
      "",
      "# Section 2",
      "",
      "Content 2.",
    ].join("\n");

    // Mock a response with multiple issues across sections
    const report: ReviewReport = {
      sections: [
        {
          type: "typo",
          title: "Typos",
          items: [
            {
              severity: "error",
              lineStart: 1,
              lineEnd: 1,
              snippet: "# Section 1",
              issue: "Error in heading",
              suggestion: "Fix it",
            },
            {
              severity: "warning",
              lineStart: 3,
              lineEnd: 3,
              snippet: "Content 1.",
              issue: "Warning in content",
              suggestion: "Review it",
            },
          ],
        },
        {
          type: "clarity",
          title: "Clarity",
          items: [
            {
              severity: "suggestion",
              lineStart: 7,
              lineEnd: 7,
              snippet: "Content 2.",
              issue: "Add more detail",
              suggestion: "Expand",
            },
          ],
        },
      ],
    };
    (callDeepSeek as Mock).mockResolvedValue({
      content: JSON.stringify(report),
      usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
    });

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(result.summary.totalIssues).toBe(3);
    expect(result.summary.errors).toBe(1);
    expect(result.summary.warnings).toBe(1);
    expect(result.summary.suggestions).toBe(1);
  });

  it("does not count ok-severity items in issue totals", async () => {
    const content = "# OK test";

    const report: ReviewReport = {
      sections: [
        {
          type: "other",
          title: "OK Items",
          items: [
            {
              severity: "ok",
              lineStart: 1,
              lineEnd: 1,
              snippet: "# OK test",
              issue: "Everything looks good",
              suggestion: "No changes needed",
            },
          ],
        },
      ],
    };
    (callDeepSeek as Mock).mockResolvedValue({
      content: JSON.stringify(report),
      usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
    });

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(result.summary.totalIssues).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Progress callback
  // -----------------------------------------------------------------------

  it("calls progress callback with correct values", async () => {
    const content = [
      "# Progress Test",
      "",
      "Testing progress callback.",
    ].join("\n");

    mockReviewResponse();
    const progressFn = vi.fn();

    const result = await incrementalReview("", content, {}, "article-1", "1.0", progressFn);

    expect(progressFn).toHaveBeenCalled();
    // First call should be (0, total)
    expect(progressFn.mock.calls[0][0]).toBe(0);
    expect(progressFn.mock.calls[0][1]).toBeGreaterThan(0);
    // Last call should have processed == total
    const lastCall = progressFn.mock.calls[progressFn.mock.calls.length - 1];
    expect(lastCall[0]).toBe(lastCall[1]);
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("handles AI call failure gracefully with fallback", async () => {
    const content = [
      "# Error Test",
      "",
      "Content that triggers error.",
    ].join("\n");

    // Mock a failed API call
    (callDeepSeek as Mock).mockRejectedValue(new Error("API timeout"));

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(result.reviewedCount).toBe(1); // counted even on fallback
    expect(result.chunks).toHaveLength(1);
    // Fallback chunk should have empty sections
    expect(result.chunks[0].sections).toEqual([]);
  });

  it("continues processing remaining chunks after a failure", async () => {
    // Create content with 2 sections that splitRange will produce 2 sub-chunks
    // Each section under 8000 chars, combined over 8000 chars
    const lines1: string[] = ["# Section 1"];
    for (let i = 0; i < 130; i++) lines1.push(
      `Line ${i} padding text for section one to get around 5k chars.`,
    );
    const lines2: string[] = ["# Section 2"];
    for (let i = 0; i < 130; i++) lines2.push(
      `Line ${i} padding text for section two to get around 5k chars.`,
    );
    const content = lines1.join("\n") + "\n\n" + lines2.join("\n");

    // First call fails, subsequent calls succeed
    (callDeepSeek as Mock)
      .mockRejectedValueOnce(new Error("First call failed"));
    // All remaining calls succeed (including 2nd sub-chunk)
    (callDeepSeek as Mock).mockResolvedValue({
      content: JSON.stringify({
        sections: [
          {
            type: "typo",
            title: "Typos",
            items: [
              {
                severity: "warning",
                lineStart: 1,
                lineEnd: 1,
                snippet: "test",
                issue: "Issue in section 2",
                suggestion: "Fix",
              },
            ],
          },
        ],
      }),
      usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 },
    });

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    expect(callDeepSeek).toHaveBeenCalledTimes(2); // 1 fail + 1 succeed
    expect(result.reviewedCount).toBe(2); // both counted (1 fallback, 1 success)
    // At least one chunk should have been found with review items
    const allIssues = result.chunks.flatMap((c) =>
      c.sections.flatMap((s) => s.items.map((i) => i.issue)),
    );
    expect(allIssues).toContain("Issue in section 2");
  });
});
