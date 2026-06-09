/**
 * @file Unified Markdown/Notesaw renderer.
 *
 * Provides a single function `renderMarkdown` that selects the appropriate
 * rendering pipeline based on `contentType`:
 * - `"markdown"`: Standard remark/rehype pipeline (GFM + KaTeX)
 * - `"notesaw"`: Notesaw custom pipeline (block syntax + GFM + KaTeX)
 *
 * Both pipelines output HTML fragments (not full documents), suitable for
 * injection into React components via `dangerouslySetInnerHTML`.
 *
 * @note Code highlighting (rehype-starry-night) is not included in this version
 * due to compatibility issues with the current unified ecosystem versions.
 * It will be added in a future update when the upstream packages stabilize.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";

import noteParsePlugin, { noteBoxParsePlugin } from "../../../packages/notesaw/parser.ts";
import { noteTransformPlugin } from "../../../packages/notesaw/transformer.ts";

/**
 * Supported content types for rendering.
 */
export type ContentType = "markdown" | "notesaw";

/**
 * Renders a markdown or Notesaw string to an HTML fragment.
 *
 * @param content - The raw markdown/Notesaw string to render
 * @param contentType - The content format to use for parsing
 * @returns A promise resolving to the rendered HTML string
 *
 * @example
 * ```ts
 * const html = await renderMarkdown("# Hello", "markdown");
 * // => "<h1>Hello</h1>"
 * ```
 *
 * @example
 * ```ts
 * const html = await renderMarkdown("@def Foo {\n  bar\n}", "notesaw");
 * // => '<div class="block-container ...">...</div>'
 * ```
 */
export async function renderMarkdown(
  content: string,
  contentType: ContentType,
): Promise<string> {
  if (!content || !content.trim()) {
    return "";
  }

  if (contentType === "notesaw") {
    return renderNotesaw(content);
  }

  return renderStandardMarkdown(content);
}

/**
 * Standard Markdown rendering pipeline.
 *
 * Uses: remark-parse → remark-gfm → remark-math → remark-rehype →
 * rehype-katex → rehype-stringify
 */
async function renderStandardMarkdown(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(content);

  return String(result);
}

/**
 * Notesaw rendering pipeline.
 *
 * Uses: noteParsePlugin → noteBoxParsePlugin → remark-rehype →
 * rehype-katex → noteTransformPlugin → rehype-stringify
 *
 * The custom noteParsePlugin is a drop-in replacement for remark-parse that
 * additionally understands Notesaw block syntax (@label { ... }).
 */
async function renderNotesaw(content: string): Promise<string> {
  const result = await unified()
    .use(noteParsePlugin)
    .use(noteBoxParsePlugin)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(noteTransformPlugin)
    .use(rehypeStringify)
    .process(content);

  return String(result);
}
