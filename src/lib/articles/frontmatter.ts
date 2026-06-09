/**
 * @file Frontmatter parsing utilities for Markdown articles.
 *
 * Provides functions for parsing YAML frontmatter from Markdown files,
 * extracting metadata, and generating URL-friendly slugs.
 */

import matter from "gray-matter";

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
