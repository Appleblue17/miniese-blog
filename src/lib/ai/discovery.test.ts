/**
 * @file Unit tests for wiki term discovery logic.
 *
 * Tests are co-located with the source file per project convention.
 * All external dependencies (prisma, callDeepSeek) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must use vi.hoisted() because vi.mock() is hoisted to top of file
// ---------------------------------------------------------------------------

const mockCallDeepSeek = vi.hoisted(() => vi.fn());

const mockPrisma = vi.hoisted(() => ({
  wikiEntry: {
    findMany: vi.fn(),
  },
  wikiDiscovery: {
    findMany: vi.fn(),
  },
}));

vi.mock("./client", () => ({
  callDeepSeek: (...args: unknown[]) => mockCallDeepSeek(...args),
}));

vi.mock("../db", () => ({
  prisma: mockPrisma,
}));

// ---------------------------------------------------------------------------
// Module import (must be after mocks)
// ---------------------------------------------------------------------------

import { discoverWikiCandidates, type DiscoveryCandidate } from "./discovery";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(
  overrides: Partial<DiscoveryCandidate> = {},
): DiscoveryCandidate {
  return {
    term: "TypeScript",
    type: "tech",
    definition: "JavaScript with static types",
    importance: 0.95,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.wikiEntry.findMany.mockResolvedValue([]);
  mockPrisma.wikiDiscovery.findMany.mockResolvedValue([]);
});

describe("discoverWikiCandidates", () => {
  it("should return candidates from AI response on short article", async () => {
    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({
        candidates: [
          makeCandidate({ term: "TypeScript", importance: 0.95 }),
          makeCandidate({ term: "Closure", type: "concept", definition: "A function with its lexical environment", importance: 0.8 }),
        ],
      }),
    });

    const result = await discoverWikiCandidates("article-1", "zh", "# Test\n\nTypeScript and Closure are related.");

    expect(result).toHaveLength(2);
    expect(result[0].term).toBe("TypeScript");
    expect(result[1].term).toBe("Closure");
    expect(mockCallDeepSeek).toHaveBeenCalledTimes(1);
  });

  it("should deduplicate terms within the same article (case-insensitive)", async () => {
    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({
        candidates: [
          makeCandidate({ term: "TypeScript" }),
          makeCandidate({ term: "typescript" }), // duplicate
          makeCandidate({ term: "Docker", type: "tech", definition: "Container runtime", importance: 0.85 }),
        ],
      }),
    });

    const result = await discoverWikiCandidates("article-1", "zh", "# Docker and TypeScript");

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.term)).toEqual(["TypeScript", "Docker"]);
  });

  it("should filter out terms that already exist as wiki entries", async () => {
    mockPrisma.wikiEntry.findMany.mockResolvedValue([
      { name: "TypeScript", language: "zh" },
    ]);

    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({
        candidates: [
          makeCandidate({ term: "TypeScript" }),
          makeCandidate({ term: "Docker", type: "tech", definition: "Container runtime", importance: 0.85 }),
        ],
      }),
    });

    const result = await discoverWikiCandidates("article-1", "zh", "# Docker and TypeScript");

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("Docker");
  });

  it("should filter out terms with already pending proposals", async () => {
    mockPrisma.wikiDiscovery.findMany.mockResolvedValue([
      { term: "Docker" },
    ]);

    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({
        candidates: [
          makeCandidate({ term: "TypeScript" }),
          makeCandidate({ term: "Docker", type: "tech", definition: "Container runtime", importance: 0.85 }),
        ],
      }),
    });

    const result = await discoverWikiCandidates("article-1", "zh", "# Docker and TypeScript");

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("TypeScript");
  });

  it("should query existing wiki entries filtered by language", async () => {
    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({
        candidates: [
          makeCandidate({ term: "TypeScript" }),
        ],
      }),
    });

    await discoverWikiCandidates("article-1", "en", "# Hello");

    expect(mockPrisma.wikiEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          language: "en",
        }),
      }),
    );
  });

  it("should query existing proposals filtered by articleId", async () => {
    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({
        candidates: [
          makeCandidate({ term: "TypeScript" }),
        ],
      }),
    });

    await discoverWikiCandidates("article-1", "zh", "# Hello");

    expect(mockPrisma.wikiDiscovery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          articleId: "article-1",
        }),
      }),
    );
    // Should NOT filter by status (all statuses included)
    const callArg = mockPrisma.wikiDiscovery.findMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("status");
  });

  it("should handle empty AI response gracefully", async () => {
    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({ candidates: [] }),
    });

    const result = await discoverWikiCandidates("article-1", "zh", "# Hello");

    expect(result).toHaveLength(0);
  });

  it("should handle malformed AI response gracefully", async () => {
    mockCallDeepSeek.mockResolvedValueOnce({
      content: "not valid json",
    });

    const result = await discoverWikiCandidates("article-1", "zh", "# Hello");

    expect(result).toHaveLength(0);
  });

  it("should handle AI response with missing candidates field", async () => {
    mockCallDeepSeek.mockResolvedValueOnce({
      content: JSON.stringify({}),
    });

    const result = await discoverWikiCandidates("article-1", "zh", "# Hello");

    expect(result).toHaveLength(0);
  });

  it("should use splitArticle for long articles and merge results", async () => {
    // Create a long article that would be split into multiple chunks
    const longArticle = Array.from({ length: 100 }, (_, i) => `## Section ${i + 1}\n\nThis is content for section ${i + 1} with some technical terms like TypeScript and Docker.\n`).join("\n");

    // The article is long enough to be split; AI is called per chunk
    mockCallDeepSeek
      .mockResolvedValueOnce({
        content: JSON.stringify({
          candidates: [
            makeCandidate({ term: "TypeScript" }),
          ],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          candidates: [
            makeCandidate({ term: "Docker", type: "tech", definition: "Container runtime", importance: 0.85 }),
          ],
        }),
      });

    const result = await discoverWikiCandidates("article-1", "zh", longArticle);

    // Results should be merged and deduplicated
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(mockCallDeepSeek).toHaveBeenCalledTimes(2);
  }, 15000);
});
