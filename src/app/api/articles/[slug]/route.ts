/**
 * @file GET /api/articles/[slug]
 *
 * Returns a single published article by slug and language.
 * Includes rendered HTML and all metadata.
 *
 * Query params:
 *   lang - Language code "zh" or "en" (required)
 *
 * Response: { article: { ...metadata }, html: string }
 *
 * Image URL resolution:
 *   Markdown images like ![alt](image.png) are rendered as <img src="image.png">
 *   (relative paths). This route rewrites them to absolute paths pointing to
 *   the dedicated image serving API: /api/images/{articleId}/{filename}.
 *   This ensures images load correctly regardless of the page URL structure.
 *
 * Auto re-rendering (rehype-slug compensation):
 *   When the stored renderedContent lacks heading IDs (e.g., from older articles
 *   or AI-translated content that bypassed rehype-slug), this route automatically
 *   re-renders the article from its source file to inject heading IDs.
 *   The updated HTML is persisted to the database for subsequent requests.
 *
 *   IMPORTANT: The Prisma query MUST include `contentPath` and `contentType`
 *   in the `select`, otherwise the re-rendering silently fails (readFile gets
 *   `undefined` path → caught by the catch block → falls back to original).
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { detectWikiLinks } from "@/lib/markdown/linkDetector";
import { parseFrontmatter } from "@/lib/articles/frontmatter";
import type { ContentType } from "@/lib/markdown/renderer";

/**
 * Rewrites relative image src paths in rendered HTML to absolute API paths.
 *
 * Transforms: <img src="image.png" ...> → <img src="/api/images/{articleId}/image.png" ...>
 * Only rewrites paths that are relative (no protocol, no leading slash).
 *
 * @param html - The rendered HTML content
 * @param articleId - The article UUID for constructing API paths
 * @returns HTML with absolute image paths
 */
function rewriteImagePaths(html: string, articleId: string): string {
  return html.replace(
    /<img([^>]+)src\s*=\s*"([^"]+)"([^>]*)>/gi,
    (_match, beforeAttrs: string, src: string, afterAttrs: string) => {
      // Skip if src is already absolute (has protocol or starts with /)
      if (/^(https?:\/\/|\/)/i.test(src)) {
        return _match;
      }
      // Skip if src is a data URI
      if (src.startsWith("data:")) {
        return _match;
      }
      const newSrc = `/api/images/${articleId}/${src}`;

      // Build responsive attributes
      let responsiveAttrs = afterAttrs;
      if (!/sizes\s*=/i.test(afterAttrs)) {
        responsiveAttrs += ` sizes="(max-width: 768px) 100vw, (max-width: 1024px) 60vw, 50vw"`;
      }
      if (!/loading\s*=/i.test(afterAttrs)) {
        responsiveAttrs += ` loading="lazy"`;
      }

      return `<img${beforeAttrs}src="${newSrc}"${responsiveAttrs}>`;
    },
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get("lang");

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "lang query parameter is required. Must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    const article = await prisma.article.findUnique({
      where: {
        slug_language: { slug, language },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        language: true,
        summary: true,
        tags: true,
        author: true,
        publishedAt: true,
        updatedAt: true,
        changelog: true,
        renderedContent: true,
        isAITranslated: true,
        originalId: true,
        contentPath: true,
        contentType: true,
      },
    });

    if (!article) {
      return NextResponse.json(
        { error: `Article not found: "${slug}" in language "${language}".` },
        { status: 404 },
      );
    }

    // Check if renderedContent has heading IDs (rehype-slug), and re-render if missing
    let content = article.renderedContent;
    if (content && !/<h[1-3][^>]*\bid\s*=/.test(content)) {
      try {
        const filePath = path.join(process.cwd(), article.contentPath);
        const rawContent = await readFile(filePath, "utf-8");
        const { content: mdBody } = parseFrontmatter(rawContent);
        const pipeline: ContentType = article.contentType || "markdown";
        const linkedContent = await detectWikiLinks({ lang: language, content: mdBody });
        content = await renderMarkdown(linkedContent, pipeline);

        // Persist the re-rendered content so subsequent requests don't re-render
        await prisma.article.update({
          where: { id: article.id },
          data: { renderedContent: content },
        });
      } catch {
        // If re-rendering fails, fall back to the original renderedContent
        console.warn(`[rehype-slug] Failed to re-render article ${article.id}, using cached.`);
      }
    }

    // Rewrite relative image paths to absolute API paths
    const html = content ? rewriteImagePaths(content, article.id) : "";

    return NextResponse.json({
      article: {
        id: article.id,
        slug: article.slug,
        title: article.title,
        language: article.language,
        summary: article.summary,
        tags: article.tags,
        author: article.author,
        publishedAt: article.publishedAt?.toISOString() || null,
        updatedAt: article.updatedAt.toISOString(),
        changelog: article.changelog,
        isAITranslated: article.isAITranslated,
        originalId: article.originalId,
      },
      html,
    });
  } catch (error) {
    console.error("Get article error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
