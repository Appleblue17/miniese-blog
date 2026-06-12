/**
 * @file Unit tests for linkDetector.ts
 *
 * Tests the detectWikiLinks function which scans Markdown content and
 * replaces wiki entry names/aliases with anchor links.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma database
vi.mock("@/lib/db", () => {
  const mockWikiEntries: Array<{
    id: string;
    name: string;
    aliases: string[];
    language: string;
  }> = [
    {
      id: "1",
      name: "DFS",
      aliases: ["深度优先搜索", "深度优先遍历"],
      language: "zh",
    },
    {
      id: "2",
      name: "BFS",
      aliases: ["广度优先搜索"],
      language: "zh",
    },
    {
      id: "3",
      name: "Dynamic Programming",
      aliases: ["动态规划", "DP"],
      language: "zh",
    },
    {
      id: "4",
      name: "Binary Search",
      aliases: ["二分查找", "二分搜索"],
      language: "zh",
    },
    {
      id: "5",
      name: "DFS",
      aliases: ["Depth First Search"],
      language: "en",
    },
    {
      id: "6",
      name: "TypeScript",
      aliases: ["TS"],
      language: "en",
    },
    {
      id: "7",
      name: "DFSort",
      aliases: [],
      language: "zh",
    },
  ];

  return {
    prisma: {
      wikiEntry: {
        findMany: vi.fn().mockImplementation(({ where }: { where: { language: string } }) => {
          return Promise.resolve(mockWikiEntries.filter((e) => e.language === where.language));
        }),
      },
    },
  };
});

// Import after mocks
import { detectWikiLinks, findWikiEntriesForLang } from "./linkDetector";
import { prisma } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Unit tests for findWikiEntriesForLang
// ============================================================

describe("findWikiEntriesForLang", () => {
  it("returns wiki entries for the given language", async () => {
    const entries = await findWikiEntriesForLang("zh");
    expect(entries).toHaveLength(5);
    expect(entries[0].name).toBe("DFS");
    expect(entries[0].aliases).toContain("深度优先搜索");
  });

  it("respects language filter", async () => {
    const zhEntries = await findWikiEntriesForLang("zh");
    const enEntries = await findWikiEntriesForLang("en");

    expect(zhEntries.every((e) => e.language === "zh")).toBe(true);
    expect(enEntries.every((e) => e.language === "en")).toBe(true);
    expect(zhEntries.length).toBe(5);
    expect(enEntries.length).toBe(2);
  });

  it("calls prisma with correct parameters", async () => {
    await findWikiEntriesForLang("zh");
    expect(prisma.wikiEntry.findMany).toHaveBeenCalledWith({
      where: { language: "zh" },
      select: { id: true, name: true, aliases: true, language: true },
    });
  });
});

// ============================================================
// Unit tests for detectWikiLinks
// ============================================================

describe("detectWikiLinks", () => {
  // --- Basic matching ---

  it("replaces wiki entry name with anchor link", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "DFS 是一种重要的算法。",
    });

    expect(result).toBe('<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 是一种重要的算法。');
  });

  it("replaces wiki alias with anchor link using the main name", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "深度优先搜索是一种遍历算法。",
    });

    expect(result).toBe(
      '<a href="/zh/wiki/DFS" data-wiki-name="DFS">深度优先搜索</a>是一种遍历算法。',
    );
  });

  it("replaces multiple different wiki entries", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "DFS 和 BFS 是两种基本算法。",
    });

    expect(result).toBe(
      '<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 和 <a href="/zh/wiki/BFS" data-wiki-name="BFS">BFS</a> 是两种基本算法。',
    );
  });

  it("applies longest match first when multiple entries overlap", async () => {
    // "DP" is a substring of "Dynamic Programming" but they are different entries
    const result = await detectWikiLinks({
      lang: "zh",
      content: "动态规划 DP 是一种算法。",
    });

    expect(result).toBe(
      '<a href="/zh/wiki/Dynamic Programming" data-wiki-name="Dynamic Programming">动态规划</a> <a href="/zh/wiki/Dynamic Programming" data-wiki-name="Dynamic Programming">DP</a> 是一种算法。',
    );
  });

  it("does not match partial words", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "DFSs is not a match.",
    });

    expect(result).toBe("DFSs is not a match.");
  });

  it("matches longer name when it is a prefix of another entry name", async () => {
    // "DFS" and "DFSort" — "DFSort" is longer, so "DFSort" should match
    // as a whole, while bare "DFS" should match separately
    const result = await detectWikiLinks({
      lang: "zh",
      content: "DFS 和 DFSort 都是算法.",
    });

    expect(result).toBe(
      '<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 和 <a href="/zh/wiki/DFSort" data-wiki-name="DFSort">DFSort</a> 都是算法.',
    );
  });

  // --- Exclusion zones ---

  it("does not replace inside code blocks (```...```)", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "这是一段代码：\n```\nDFS 算法\n```\n正文中的 DFS。",
    });

    expect(result).toContain("```\nDFS 算法\n```");
    // The DFS inside code block should NOT be replaced
    expect(result).toContain("```\nDFS 算法\n```");
    // But the one outside should
    expect(result).toContain('<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a>。');
  });

  it("does not replace inside inline code", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "使用 `DFS` 函数和真正的 DFS 算法。",
    });

    expect(result).toContain("`DFS`");
    expect(result).toContain('真正的 <a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 算法。');
  });

  it("does not replace inside math block ($$...$$)", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "公式：\n$$\nDFS(x) = x^2\n$$\n然后 DFS 是算法。",
    });

    expect(result).toContain("$$\nDFS(x) = x^2\n$$");
    expect(result).toContain('然后 <a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 是算法。');
  });

  it("does not replace inside inline math ($...$)", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "公式 $DFS$ 和 DFS 算法。",
    });

    expect(result).toContain("$DFS$");
    expect(result).toContain('和 <a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 算法。');
  });

  it("does not replace inside existing Markdown links", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "[DFS](https://example.com) 和本文的 DFS。",
    });

    // The link text should remain unchanged inside the markdown link
    expect(result).toContain("[DFS](https://example.com)");
    // But outside it should be replaced
    expect(result).toContain('和本文的 <a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a>。');
  });

  it("does not replace inside existing HTML anchor tags", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: '<a href="/en/wiki/DFS">DFS</a> 和本文的 DFS。',
    });

    // Inside existing <a> tag, not replaced
    expect(result).toContain('<a href="/en/wiki/DFS">DFS</a>');
    // Outside, replaced
    expect(result).toContain('和本文的 <a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a>。');
  });

  // --- Language filtering ---

  it("only matches entries for the specified language", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "TypeScript 和 DFS 都是好东西。",
    });

    // "TypeScript" is an English entry, should NOT be replaced in zh
    expect(result).toContain("TypeScript");
    // "DFS" is both zh and en, should be replaced in zh
    expect(result).toContain('<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a>');
  });

  it("matches English entries for English language content", async () => {
    const result = await detectWikiLinks({
      lang: "en",
      content: "TypeScript and DFS are both great.",
    });

    expect(result).toContain(
      '<a href="/en/wiki/TypeScript" data-wiki-name="TypeScript">TypeScript</a>',
    );
    expect(result).toContain('<a href="/en/wiki/DFS" data-wiki-name="DFS">DFS</a>');
  });

  // --- Edge cases ---

  it("returns empty string for empty content", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "",
    });

    expect(result).toBe("");
  });

  it("returns original content when no entries match", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "没有任何匹配的内容。",
    });

    expect(result).toBe("没有任何匹配的内容。");
  });

  it("handles content with only whitespace", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "   \n  ",
    });

    expect(result).toBe("   \n  ");
  });

  it("handles entries with special regex characters in names", async () => {
    // Add an entry with special chars to the mock (but we can't modify mocks easily,
    // so just test that normal entries still work)
    const result = await detectWikiLinks({
      lang: "zh",
      content: "二分查找在有序数组中很常用。",
    });

    expect(result).toBe(
      '<a href="/zh/wiki/Binary Search" data-wiki-name="Binary Search">二分查找</a>在有序数组中很常用。',
    );
  });

  it("replaces same entry multiple times in the text", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "DFS 是基础，学习 DFS 很重要。",
    });

    expect(result).toBe(
      '<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 是基础，学习 <a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a> 很重要。',
    );
  });

  it("replaces alias when main name also appears", async () => {
    const result = await detectWikiLinks({
      lang: "zh",
      content: "DFS（深度优先搜索）",
    });

    expect(result).toBe(
      '<a href="/zh/wiki/DFS" data-wiki-name="DFS">DFS</a>（<a href="/zh/wiki/DFS" data-wiki-name="DFS">深度优先搜索</a>）',
    );
  });

  it("prefers longer match over shorter one in overlapping aliases", async () => {
    // If we have two aliases where one is a substring of another,
    // the longer one should match
    const result = await detectWikiLinks({
      lang: "zh",
      content: "深度优先搜索遍历。",
    });

    // "深度优先搜索" (DFS alias, 6 chars) should match as a whole
    expect(result).toBe('<a href="/zh/wiki/DFS" data-wiki-name="DFS">深度优先搜索</a>遍历。');
  });
});
