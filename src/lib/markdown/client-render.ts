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
 */
export async function renderChatMarkdown(markdown: string): Promise<string> {
  if (!processor) {
    processor = createProcessor();
  }
  const result = await processor.process(markdown);
  return String(result);
}
