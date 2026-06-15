/**
 * @file client-render.ts — Lightweight Markdown to HTML renderer for the browser.
 *
 * Uses the same unified/remark pipeline as the server-side renderer, but
 * without Notesaw support (Chat AI responses are plain Markdown).
 * This is safe to import and use in client components.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";

let processor: ReturnType<typeof createProcessor> | null = null;

function createProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true });
}

/**
 * Renders Markdown string to HTML string in the browser.
 * Uses a lazy singleton processor for efficiency.
 *
 * Supports both standard $...$ / $$...$$ and LaTeX-style \(...\) / \[...\]
 * math delimiters by normalizing the latter to the former.
 */
export async function renderChatMarkdown(markdown: string): Promise<string> {
  if (!processor) {
    processor = createProcessor();
  }

  // Normalize \(...\) to $...$ and \[...\] to $$...$$
  // Must replace \[ before \( to avoid partial matches
  const normalized = markdown
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$\n$1\n$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$");

  const result = await processor.process(normalized);
  return String(result);
}
