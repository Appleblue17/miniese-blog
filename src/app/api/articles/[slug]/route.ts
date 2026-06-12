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
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
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
      html: article.renderedContent || "",
    });
  } catch (error) {
    console.error("Get article error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
