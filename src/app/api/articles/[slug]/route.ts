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
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
      return `<img${beforeAttrs}src="${newSrc}"${afterAttrs}>`;
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
      },
    });

    if (!article) {
      return NextResponse.json(
        { error: `Article not found: "${slug}" in language "${language}".` },
        { status: 404 },
      );
    }

    // Rewrite relative image paths to absolute API paths
    const html = article.renderedContent
      ? rewriteImagePaths(article.renderedContent, article.id)
      : "";

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
