/**
 * @file Frontmatter parsing utilities for Markdown articles.
 *
 * Provides functions for parsing YAML frontmatter from Markdown files,
 * extracting metadata, generating URL-friendly slugs, and building
 * frontmatter strings from UI-provided metadata.
 */

import matter from "gray-matter";

/**
 * Article frontmatter metadata fields managed by the UI.
 * These are the fields that the publish form provides.
 */
export interface ArticleMeta {
  title: string;
  language: "zh" | "en";
  fileType: "markdown" | "notesaw";
  tags: string[];
  author: string;
  summary: string;
}

/**
 * Article frontmatter metadata fields.
 * All fields are optional in the source file except `title`.
 */
export interface ArticleFrontmatter {
  title: string;
  slug?: string;
  language?: "zh" | "en";
  tags?: string[];
  summary?: string;
  author?: string;
  accessGroup?: string[];
  changelog?: string;
  contentType?: "markdown" | "notesaw";
  fileType?: "markdown" | "notesaw";
  [key: string]: unknown; // Allow extra fields
}

/**
 * Result of parsing a Markdown file with frontmatter.
 */
export interface ParsedArticle {
  /** Parsed frontmatter metadata */
  frontmatter: ArticleFrontmatter;
  /** Markdown body without frontmatter */
  content: string;
  /** Raw file content (with frontmatter) */
  raw: string;
}

/**
 * Parses YAML frontmatter from a raw Markdown string.
 *
 * @param raw - The raw Markdown content (may include frontmatter)
 * @returns Parsed frontmatter and body content
 *
 * @example
 * ```ts
 * const { frontmatter, content } = parseFrontmatter(
 *   '---\ntitle: "Hello"\ntags: [a, b]\n---\n\nBody'
 * );
 * // frontmatter.title === "Hello"
 * // content === "\nBody"
 * ```
 */
export function parseFrontmatter(raw: string): ParsedArticle {
  const result = matter(raw);

  return {
    frontmatter: result.data as ArticleFrontmatter,
    content: result.content,
    raw,
  };
}

/**
 * Generates a URL-friendly slug from a title string.
 *
 * The slug is lowercased, with non-alphanumeric characters (including CJK)
 * replaced by hyphens. Leading and trailing hyphens are stripped.
 *
 * @param title - The article title
 * @param existingSlug - An optional pre-defined slug (returned as-is if provided)
 * @returns A URL-safe slug string
 *
 * @example
 * ```ts
 * generateSlug("Hello World")          // => "hello-world"
 * generateSlug("My Article!", "custom") // => "custom"
 * generateSlug("你好世界")              // => "你好世界"
 * ```
 */
export function generateSlug(title: string, existingSlug?: string): string {
  if (existingSlug) {
    return existingSlug;
  }

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Fields managed by the UI — used to avoid overwriting extra frontmatter
const MANAGED_FIELDS = new Set([
  "title",
  "language",
  "fileType",
  "tags",
  "author",
  "summary",
  "slug",
  "accessGroup",
  "changelog",
  "contentType",
]);

/**
 * Builds a file string with frontmatter from UI-provided metadata and
 * the raw original content.
 *
 * - Uses meta fields to set known frontmatter keys
 * - Preserves any extra frontmatter fields from the original file
 *   that are NOT managed by the UI
 * - Ensures tags are serialized as inline YAML array `[a, b]` (not block list)
 *
 * @param raw - The original raw file content (may include old frontmatter)
 * @param meta - The UI-provided metadata
 * @returns The complete file content with updated frontmatter
 *
 * @example
 * ```ts
 * const result = buildFrontmatter(raw, {
 *   title: "My Article",
 *   language: "zh",
 *   fileType: "markdown",
 *   tags: ["dev"],
 *   author: "博主",
 *   summary: "A summary",
 * });
 * ```
 */
export function buildFrontmatter(raw: string, meta: ArticleMeta): string {
  // Parse existing frontmatter to extract extra fields
  const extraFields: Record<string, unknown> = {};
  let parsedFrontmatter: Record<string, unknown> | null = null;

  try {
    const parsed = matter(raw);
    parsedFrontmatter = parsed.data as Record<string, unknown>;
    const allFields = parsed.data as Record<string, unknown>;

    // Collect fields not managed by the UI
    for (const [key, value] of Object.entries(allFields)) {
      if (!MANAGED_FIELDS.has(key)) {
        extraFields[key] = value;
      }
    }
  } catch {
    // If parsing fails, treat as no frontmatter
  }

  // Build new frontmatter data
  const newData: Record<string, unknown> = {
    title: meta.title,
    language: meta.language,
    fileType: meta.fileType,
    tags: meta.tags,
    author: meta.author,
    summary: meta.summary || undefined,
    ...extraFields, // Preserve extra fields (may override managed fields intentionally)
  };

  // Preserve slug from original frontmatter if not provided in meta
  // (slug is in MANAGED_FIELDS but not in ArticleMeta, so it gets excluded
  //  from extraFields — we need to keep it explicitly)
  if (parsedFrontmatter?.slug && !newData.slug) {
    newData.slug = parsedFrontmatter.slug;
  }

  // Re-apply managed fields to ensure they take precedence
  newData.title = meta.title;
  newData.language = meta.language;
  newData.fileType = meta.fileType;
  newData.tags = meta.tags;
  newData.author = meta.author;
  if (meta.summary) {
    newData.summary = meta.summary;
  } else {
    delete newData.summary;
  }

  // Extract body (content without frontmatter) from the raw string
  let body: string;
  try {
    const parsed = matter(raw);
    body = parsed.content;
  } catch {
    body = raw;
  }

  // Manually build YAML frontmatter to control array formatting
  const yamlLines: string[] = [];
  yamlLines.push("---");
  for (const [key, value] of Object.entries(newData)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      // Format as inline array: tags: [a, b, c]
      const items = value.map((v) =>
        typeof v === "string" && /[:\-#\[\]{}%,&*?|<>!@`"']/.test(v)
          ? `'${v.replace(/'/g, "''")}'`
          : String(v),
      );
      yamlLines.push(`${key}: [${items.join(", ")}]`);
    } else if (typeof value === "string" && /[:\-#\[\]{}%,&*?|<>!@`"']|\s/.test(value)) {
      yamlLines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
    } else {
      yamlLines.push(`${key}: ${String(value)}`);
    }
  }
  yamlLines.push("---");

  // Build the full file content
  const result = yamlLines.join("\n") + "\n" + body.trimStart();
  return result;
}
