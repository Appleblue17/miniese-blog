/**
 * @file Unit tests for wiki file block parser.
 */

import { describe, it, expect } from "vitest";
import {
  parseWikiFile,
  buildWikiFile,
  slugifyName,
  parseWikiFileWithMeta,
  buildWikiFileWithMeta,
} from "./parser";

describe("parseWikiFile", () => {
  it("extracts all four blocks from a complete file", () => {
    const content = [
      `<!-- DEF_START -->`,
      `A short definition for the term.`,
      `<!-- DEF_END -->`,
      ``,
      `<!-- HUMAN_START -->`,
      `# Human Notes`,
      ``,
      `Some detailed explanation.`,
      `<!-- HUMAN_END -->`,
      ``,
      `<!-- AI_START -->`,
      `AI-generated supplementary content.`,
      `<!-- AI_END -->`,
      ``,
      `<!-- REF_START -->`,
      `1. Source A`,
      `2. Source B`,
      `<!-- REF_END -->`,
    ].join("\n");

    const blocks = parseWikiFile(content);

    expect(blocks.definition).toBe("A short definition for the term.");
    expect(blocks.human).toBe("# Human Notes\n\nSome detailed explanation.");
    expect(blocks.ai).toBe("AI-generated supplementary content.");
    expect(blocks.ref).toBe("1. Source A\n2. Source B");
  });

  it("returns empty strings for missing blocks", () => {
    const content = `Some text that has no block markers.`;

    const blocks = parseWikiFile(content);

    expect(blocks.definition).toBe("");
    expect(blocks.human).toBe("");
    expect(blocks.ai).toBe("");
    expect(blocks.ref).toBe("");
  });

  it("handles missing AI and REF blocks", () => {
    const content = [
      `<!-- DEF_START -->`,
      `Definition.`,
      `<!-- DEF_END -->`,
      ``,
      `<!-- HUMAN_START -->`,
      `Notes.`,
      `<!-- HUMAN_END -->`,
    ].join("\n");

    const blocks = parseWikiFile(content);

    expect(blocks.definition).toBe("Definition.");
    expect(blocks.human).toBe("Notes.");
    expect(blocks.ai).toBe("");
    expect(blocks.ref).toBe("");
  });

  it("handles content with Markdown tables and special characters", () => {
    const content = [
      `<!-- DEF_START -->`,
      `A **bold** definition with \`code\`.`,
      `<!-- DEF_END -->`,
      ``,
      `<!-- HUMAN_START -->`,
      `| Col1 | Col2 |`,
      `|------|------|`,
      `| A    | B    |`,
      `<!-- HUMAN_END -->`,
    ].join("\n");

    const blocks = parseWikiFile(content);

    expect(blocks.definition).toBe("A **bold** definition with `code`.");
    expect(blocks.human).toContain("| Col1 | Col2 |");
    expect(blocks.human).toContain("| A    | B    |");
  });

  it("handles block markers with extra whitespace", () => {
    const content = `<!--  DEF_START  -->Content<!--  DEF_END  -->`;

    const blocks = parseWikiFile(content);

    expect(blocks.definition).toBe("Content");
  });

  it("handles empty block between markers", () => {
    const content = `<!-- DEF_START --><!-- DEF_END -->`;

    const blocks = parseWikiFile(content);

    expect(blocks.definition).toBe("");
  });

  it("returns only the first match if markers appear multiple times", () => {
    const content = [
      `<!-- DEF_START -->`,
      `First definition.`,
      `<!-- DEF_END -->`,
      ``,
      `<!-- DEF_START -->`,
      `Duplicate.`,
      `<!-- DEF_END -->`,
    ].join("\n");

    const blocks = parseWikiFile(content);

    // Regex is non-greedy, should match the first occurrence
    expect(blocks.definition).toBe("First definition.");
  });

  it("trims whitespace from block content", () => {
    const content = `<!-- DEF_START -->  \n  Spaced content  \n  <!-- DEF_END -->`;

    const blocks = parseWikiFile(content);

    expect(blocks.definition).toBe("Spaced content");
  });
});

describe("buildWikiFile", () => {
  it("assembles blocks in the correct order: DEF → HUMAN → AI → REF", () => {
    const blocks = {
      definition: "Def",
      human: "Human",
      ai: "AI",
      ref: "Ref",
    };

    const result = buildWikiFile(blocks);

    // Check order by indexOf
    const defIdx = result.indexOf("DEF_START");
    const humanIdx = result.indexOf("HUMAN_START");
    const aiIdx = result.indexOf("AI_START");
    const refIdx = result.indexOf("REF_START");

    expect(defIdx).toBeGreaterThanOrEqual(0);
    expect(humanIdx).toBeGreaterThan(defIdx);
    expect(aiIdx).toBeGreaterThan(humanIdx);
    expect(refIdx).toBeGreaterThan(aiIdx);
  });

  it("includes all four blocks even if content is empty", () => {
    const blocks = {
      definition: "",
      human: "",
      ai: "",
      ref: "",
    };

    const result = buildWikiFile(blocks);

    expect(result).toContain("DEF_START");
    expect(result).toContain("DEF_END");
    expect(result).toContain("HUMAN_START");
    expect(result).toContain("AI_START");
    expect(result).toContain("REF_END");
  });

  it("preserves content when round-tripping with parseWikiFile", () => {
    const original: import("./parser").WikiBlocks = {
      definition: "A definition.",
      human: "Human notes with **Markdown**.",
      ai: "AI content here.",
      ref: "[1] Reference\n[2] Another",
    };

    const file = buildWikiFile(original);
    const parsed = parseWikiFile(file);

    expect(parsed).toEqual(original);
  });

  it("round-trips empty blocks correctly", () => {
    const original: import("./parser").WikiBlocks = {
      definition: "Just definition.",
      human: "",
      ai: "",
      ref: "",
    };

    const file = buildWikiFile(original);
    const parsed = parseWikiFile(file);

    expect(parsed.definition).toBe("Just definition.");
    expect(parsed.human).toBe("");
    expect(parsed.ai).toBe("");
    expect(parsed.ref).toBe("");
  });
});

describe("slugifyName", () => {
  it("converts spaces to hyphens and lowercases", () => {
    expect(slugifyName("Hello World")).toBe("hello-world");
  });

  it("removes special characters except hyphens and CJK", () => {
    expect(slugifyName("TypeScript 5!")).toBe("typescript-5");
  });

  it("preserves Chinese characters", () => {
    expect(slugifyName("勾股定理")).toBe("勾股定理");
  });

  it("handles mixed Chinese and English", () => {
    expect(slugifyName("DFS 算法")).toBe("dfs-算法");
  });

  it("collapses multiple hyphens", () => {
    expect(slugifyName("foo   bar   baz")).toBe("foo-bar-baz");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugifyName("  --hello--  ")).toBe("hello");
  });

  it("replaces underscores with hyphens", () => {
    expect(slugifyName("hello_world")).toBe("hello-world");
  });

  it("returns empty string for only-special input", () => {
    expect(slugifyName("!!!")).toBe("");
  });
});

describe("parseWikiFileWithMeta", () => {
  it("parses frontmatter and blocks from a complete file", () => {
    const content = [
      "---",
      "name: DFS",
      "aliases: [深度优先搜索]",
      "language: zh",
      "tags: [算法, 图论]",
      "status: reviewed",
      "accessGroup: []",
      "---",
      "",
      "<!-- DEF_START -->",
      "A short definition.",
      "<!-- DEF_END -->",
      "",
      "<!-- HUMAN_START -->",
      "# Human Notes",
      "<!-- HUMAN_END -->",
    ].join("\n");

    const parsed = parseWikiFileWithMeta(content);

    expect(parsed.frontmatter.name).toBe("DFS");
    expect(parsed.frontmatter.aliases).toEqual(["深度优先搜索"]);
    expect(parsed.frontmatter.language).toBe("zh");
    expect(parsed.frontmatter.tags).toEqual(["算法", "图论"]);
    expect(parsed.frontmatter.status).toBe("reviewed");
    expect(parsed.frontmatter.accessGroup).toEqual([]);

    expect(parsed.blocks.definition).toBe("A short definition.");
    expect(parsed.blocks.human).toContain("Human Notes");
    expect(parsed.blocks.ai).toBe("");
    expect(parsed.blocks.ref).toBe("");
  });

  it("uses defaults when frontmatter lacks fields", () => {
    const content = [
      "---",
      "name: Test",
      "---",
      "",
      "<!-- DEF_START -->Def<!-- DEF_END -->",
    ].join("\n");

    const parsed = parseWikiFileWithMeta(content);

    expect(parsed.frontmatter.name).toBe("Test");
    expect(parsed.frontmatter.language).toBe("zh");
    expect(parsed.frontmatter.status).toBe("creating");
    expect(parsed.frontmatter.tags).toEqual([]);
    expect(parsed.frontmatter.aliases).toEqual([]);
  });

  it("handles file without frontmatter", () => {
    const content = "<!-- DEF_START -->Def<!-- DEF_END -->";

    const parsed = parseWikiFileWithMeta(content);

    expect(parsed.frontmatter.name).toBe("");
    expect(parsed.frontmatter.language).toBe("zh");
    expect(parsed.blocks.definition).toBe("Def");
  });
});

describe("buildWikiFileWithMeta", () => {
  it("builds file with frontmatter and blocks", () => {
    const result = buildWikiFileWithMeta(
      {
        name: "DFS",
        language: "zh",
        aliases: ["深度优先搜索"],
        tags: ["算法"],
        status: "reviewed",
      },
      {
        definition: "A definition.",
        human: "# Notes",
        ai: "",
        ref: "",
      },
    );

    expect(result).toContain("---");
    expect(result).toContain("name: DFS");
    expect(result).toContain("aliases: [深度优先搜索]");
    expect(result).toContain("language: zh");
    expect(result).toContain("tags: [算法]");
    expect(result).toContain("status: reviewed");
    expect(result).toContain("<!-- DEF_START -->");
    expect(result).toContain("A definition.");
    expect(result).toContain("<!-- HUMAN_START -->");
    expect(result).toContain("# Notes");
    expect(result).toContain("<!-- REF_END -->");

    // Verify order: frontmatter before blocks
    const fmEnd = result.indexOf("---", 3); // Second "---" closing frontmatter
    const defStart = result.indexOf("DEF_START");
    expect(defStart).toBeGreaterThan(fmEnd);
  });

  it("round-trips correctly with parseWikiFileWithMeta", () => {
    const originalMeta = {
      name: "Test",
      language: "en" as const,
      aliases: ["Alias1"],
      tags: ["tag1"],
      status: "unreviewed" as const,
    };
    const originalBlocks = {
      definition: "Def",
      human: "Human",
      ai: "AI",
      ref: "Ref",
    };

    const file = buildWikiFileWithMeta(originalMeta, originalBlocks);
    const parsed = parseWikiFileWithMeta(file);

    expect(parsed.frontmatter.name).toBe("Test");
    expect(parsed.frontmatter.language).toBe("en");
    expect(parsed.frontmatter.aliases).toEqual(["Alias1"]);
    expect(parsed.frontmatter.tags).toEqual(["tag1"]);
    expect(parsed.frontmatter.status).toBe("unreviewed");
    expect(parsed.blocks).toEqual(originalBlocks);
  });
});
