/**
 * Integration test: JSON serialize/deserialize round-trip of ReviewResult.
 * This simulates what happens when the result is saved to PostgreSQL JSONB
 * and then loaded back on the next review.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { incrementalReview, type ReviewResult, type ReviewChunk } from "./reviewer";
import { callDeepSeek } from "./client";
import type { Mock } from "vitest";

vi.mock("./client", () => ({
  callDeepSeek: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  (callDeepSeek as Mock).mockReset();
});

function mockReviewResponse() {
  (callDeepSeek as Mock).mockResolvedValue({
    content: JSON.stringify({
      sections: [
        {
          type: "typo",
          title: "Typographical Issues",
          items: [
            {
              severity: "warning",
              lineStart: 1,
              lineEnd: 1,
              snippet: "test",
              issue: "Test issue",
              suggestion: "Fix it",
            },
          ],
        },
      ],
    }),
    usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
  });
}

describe("JSON round-trip simulation", () => {
  it("should preserve contentSnapshot and contentMap after JSON serialization", async () => {
    const content = [
      "# Hello World",
      "",
      "This is a test article.",
      "",
      "## Section 2",
      "",
      "More content here.",
      "",
      "Final paragraph.",
    ].join("\n");

    mockReviewResponse();

    // --- First review (full) ---
    const result1 = await incrementalReview("", content, {}, "article-1", "1.0");

    console.log(`First review: reviewed=${result1.reviewedCount}, reused=${result1.reusedCount}`);
    console.log(`contentSnapshot length: ${result1.contentSnapshot.length}`);
    console.log(`contentMap keys: ${Object.keys(result1.contentMap).length}`);

    // Expect contentSnapshot to be non-empty
    expect(result1.contentSnapshot.length).toBeGreaterThan(0);
    expect(Object.keys(result1.contentMap).length).toBeGreaterThan(0);

    // --- Simulate JSON serialization (like JSONB in DB) ---
    const serialized = JSON.parse(JSON.stringify(result1));

    console.log(`\nAfter JSON round-trip:`);
    console.log(`contentSnapshot length: ${serialized.contentSnapshot.length}`);
    console.log(`contentMap keys: ${Object.keys(serialized.contentMap).length}`);
    console.log(`contentSnapshot type: ${typeof serialized.contentSnapshot}`);
    console.log(
      `contentMap is object: ${typeof serialized.contentMap === "object" && !Array.isArray(serialized.contentMap)}`,
    );

    // Verify types
    expect(typeof serialized.contentSnapshot).toBe("string");
    expect(serialized.contentSnapshot.length).toBeGreaterThan(0);
    expect(Object.keys(serialized.contentMap).length).toBeGreaterThan(0);

    // --- Second review (incremental) using deserialized data ---
    const newContent = [
      "# Hello World",
      "",
      "This is a test article (edited).", // changed
      "",
      "## Section 2",
      "",
      "More content here.", // unchanged
      "",
      "Final paragraph.", // unchanged
    ].join("\n");

    // Reset mock for the changed chunk
    mockReviewResponse();

    const result2 = await incrementalReview(
      serialized.contentSnapshot, // as loaded from DB
      newContent,
      serialized.contentMap, // as loaded from DB
      "article-1",
      "1.0",
    );

    console.log(
      `\nSecond review: reviewed=${result2.reviewedCount}, reused=${result2.reusedCount}`,
    );
    console.log(`contentSnapshot length: ${result2.contentSnapshot.length}`);

    // Expect at least some reuse
    expect(result2.reusedCount).toBeGreaterThan(0);

    console.log("\nPASSED: contentSnapshot and contentMap survive JSON round-trip!");
  });

  it("should detect when contentSnapshot is empty and do full review", async () => {
    const content = ["# Hello", "", "Test content."].join("\n");

    mockReviewResponse();

    const result = await incrementalReview("", content, {}, "article-1", "1.0");

    // This simulates what happens when oldSourceContent is empty
    // (no previous completed review found)
    expect(result.reviewedCount).toBe(1);
    expect(result.reusedCount).toBe(0);
    expect(result.contentSnapshot).toBe(content);

    // Now simulate loading empty data from DB
    const result2 = await incrementalReview(
      "", // empty contentSnapshot from DB
      content,
      {}, // empty contentMap from DB
      "article-1",
      "1.0",
    );

    console.log(
      `Second review (empty old): reviewed=${result2.reviewedCount}, reused=${result2.reusedCount}`,
    );

    // Should do a full review again
    expect(result2.reviewedCount).toBe(1);
    expect(result2.reusedCount).toBe(0);
  });
});
