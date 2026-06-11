/**
 * @file Wiki file block parser and frontmatter utilities.
 *
 * Wiki entries are stored as Markdown files with frontmatter metadata
 * and four optional content sections demarcated by HTML comment markers:
 *
 *   ---
 *   name: DFS
 *   aliases: [深度优先搜索]
 *   language: zh
 *   tags: [算法]
 *   status: reviewed
 *   accessGroup: []
 *   ---
 *
 *   <!-- DEF_START -->...<!-- DEF_END -->  — Definition block (hover preview)
 *   <!-- HUMAN_START -->...<!-- HUMAN_END -->  — Human-authored notes
 *   <!-- AI_START -->...<!-- AI_END -->  — AI-generated content
 *   <!-- REF_START -->...<!-- REF_END -->  — References / sources
 *
 * The canonical file order is: frontmatter → DEF → HUMAN → AI → REF
 */

import { parseFrontmatter } from "@/lib/articles/frontmatter";

// --- Types ---

/**
 * Frontmatter metadata fields for a wiki entry file.
 */
export interface WikiFrontmatter {
  name: string;
  aliases?: string[];
  language: "zh" | "en";
  tags?: string[];
  status?: "proposed" | "creating" | "unreviewed" | "reviewed";
  accessGroup?: string[];
}

/**
 * The four content blocks of a wiki entry file.
 * All fields are strings; empty string means the block is not present.
 */
export interface WikiBlocks {
  /** Definition block — short content used for hover preview. */
  definition: string;
  /** Human-authored notes block. */
  human: string;
  /** AI-generated content block. */
  ai: string;
  /** References / sources block. */
  ref: string;
}

/**
 * Complete parsed wiki entry from a file.
 */
export interface ParsedWikiFile {
  /** Frontmatter metadata */
  frontmatter: WikiFrontmatter;
  /** Content blocks */
  blocks: WikiBlocks;
}

// --- Block markers ---

const BLOCK_PATTERNS: Record<keyof WikiBlocks, RegExp> = {
  definition: /<!--\s*DEF_START\s*-->([\s\S]*?)<!--\s*DEF_END\s*-->/,
  human: /<!--\s*HUMAN_START\s*-->([\s\S]*?)<!--\s*HUMAN_END\s*-->/,
  ai: /<!--\s*AI_START\s*-->([\s\S]*?)<!--\s*AI_END\s*-->/,
  ref: /<!--\s*REF_START\s*-->([\s\S]*?)<!--\s*REF_END\s*-->/,
};

// --- Public API ---

/**
 * Parses a wiki file content string and extracts the four blocks.
 *
 * Blocks are identified by their start/end comment markers.
 * If a block is not found in the content, its value is an empty string.
 *
 * @param content - The raw content of a wiki .md file
 * @returns An object with `definition`, `human`, `ai`, and `ref` fields
 *
 * @example
 * ```ts
 * const blocks = parseWikiFile(`<!-- DEF_START -->A term.<!-- DEF_END -->`);
 * // => { definition: "A term.", human: "", ai: "", ref: "" }
 * ```
 */
export function parseWikiFile(content: string): WikiBlocks {
  const blocks: WikiBlocks = {
    definition: "",
    human: "",
    ai: "",
    ref: "",
  };

  for (const [key, pattern] of Object.entries(BLOCK_PATTERNS)) {
    const match = content.match(pattern);
    if (match && match[1] !== undefined) {
      blocks[key as keyof WikiBlocks] = match[1].trim();
    }
  }

  return blocks;
}

/**
 * Assembles wiki blocks into a canonical file content string.
 *
 * The order is always: DEF → HUMAN → AI → REF
 * Empty blocks are represented as empty sections (comment markers with no content).
 * This ensures that round-trip consistency is preserved.
 *
 * @param blocks - The four content blocks to assemble
 * @returns A string suitable for writing to a .md file
 *
 * @example
 * ```ts
 * const file = buildWikiFile({
 *   definition: "A short definition.",
 *   human: "My notes.",
 *   ai: "",
 *   ref: "[1] Source",
 * });
 * // => "<!-- DEF_START -->\nA short definition.\n<!-- DEF_END -->\n\n<!-- HUMAN_START -->\nMy notes.\n<!-- HUMAN_END -->\n\n<!-- AI_START -->\n<!-- AI_END -->\n\n<!-- REF_START -->\n[1] Source\n<!-- REF_END -->"
 * ```
 */
export function buildWikiFile(blocks: WikiBlocks): string {
  const parts: string[] = [];

  // DEF block
  parts.push(`<!-- DEF_START -->`);
  parts.push(blocks.definition);
  parts.push(`<!-- DEF_END -->`);

  // HUMAN block
  parts.push(``);
  parts.push(`<!-- HUMAN_START -->`);
  parts.push(blocks.human);
  parts.push(`<!-- HUMAN_END -->`);

  // AI block
  parts.push(``);
  parts.push(`<!-- AI_START -->`);
  parts.push(blocks.ai);
  parts.push(`<!-- AI_END -->`);

  // REF block
  parts.push(``);
  parts.push(`<!-- REF_START -->`);
  parts.push(blocks.ref);
  parts.push(`<!-- REF_END -->`);

  return parts.join("\n");
}

/**
 * Parses a wiki file content string, extracting both frontmatter and blocks.
 *
 * @param content - The raw content of a wiki .md file (may include frontmatter)
 * @returns A `ParsedWikiFile` with frontmatter and blocks
 *
 * @example
 * ```ts
 * const parsed = parseWikiFileWithMeta(`---\nname: DFS\nlanguage: zh\n---\n\n<!-- DEF_START -->Def<!-- DEF_END -->`);
 * // parsed.frontmatter.name === "DFS"
 * // parsed.blocks.definition === "Def"
 * ```
 */
export function parseWikiFileWithMeta(content: string): ParsedWikiFile {
  const { frontmatter } = parseFrontmatter(content);

  // Extract frontmatter metadata as WikiFrontmatter
  const meta: WikiFrontmatter = {
    name: (frontmatter.name as string) || "",
    aliases: (frontmatter.aliases as string[]) || [],
    language: (frontmatter.language as "zh" | "en") || "zh",
    tags: (frontmatter.tags as string[]) || [],
    status: (frontmatter.status as WikiFrontmatter["status"]) || "proposed",
    accessGroup: (frontmatter.accessGroup as string[]) || [],
  };

  // Remove frontmatter before parsing blocks
  const parsed = parseFrontmatter(content);
  const blocks = parseWikiFile(parsed.content);

  return { frontmatter: meta, blocks };
}

/**
 * Builds a complete wiki file content string with frontmatter and blocks.
 *
 * The frontmatter is built from the provided metadata, and the blocks
 * are assembled in canonical order: DEF → HUMAN → AI → REF.
 *
 * @param meta - Frontmatter metadata
 * @param blocks - The four content blocks
 * @returns A string suitable for writing to a .md file
 *
 * @example
 * ```ts
 * const file = buildWikiFileWithMeta(
 *   { name: "DFS", language: "zh", tags: ["算法"], status: "reviewed" },
 *   { definition: "深度优先搜索", human: "", ai: "", ref: "" },
 * );
 * ```
 */
export function buildWikiFileWithMeta(
  meta: WikiFrontmatter,
  blocks: WikiBlocks,
): string {
  // Build frontmatter string using the raw approach
  const yamlLines: string[] = [];
  yamlLines.push("---");
  yamlLines.push(`name: ${meta.name}`);
  if (meta.aliases && meta.aliases.length > 0) {
    yamlLines.push(`aliases: [${meta.aliases.join(", ")}]`);
  }
  yamlLines.push(`language: ${meta.language}`);
  if (meta.tags && meta.tags.length > 0) {
    yamlLines.push(`tags: [${meta.tags.join(", ")}]`);
  }
  if (meta.status) {
    yamlLines.push(`status: ${meta.status}`);
  }
  if (meta.accessGroup && meta.accessGroup.length > 0) {
    yamlLines.push(`accessGroup: [${meta.accessGroup.join(", ")}]`);
  }
  yamlLines.push("---");

  // Build blocks portion
  const blocksStr = buildWikiFile(blocks);

  return yamlLines.join("\n") + "\n\n" + blocksStr;
}

/**
 * Slugifies a wiki entry name for use in URLs and file names.
 *
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes non-alphanumeric characters (except hyphens)
 * - Collapses multiple consecutive hyphens
 * - Removes leading/trailing hyphens
 *
 * @param name - The raw name to slugify
 * @returns A URL-safe slug string
 *
 * @example
 * ```ts
 * slugifyName("Hello World");  // => "hello-world"
 * slugifyName("TypeScript 5!"); // => "typescript-5"
 * slugifyName("  Foo  Bar  "); // => "foo-bar"
 * ```
 */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "") // Keep CJK chars
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
