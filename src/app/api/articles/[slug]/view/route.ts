/**
 * @file POST /api/articles/[slug]/view
 *
 * Increments the view count for an article (both language versions).
 * Idempotent per session: uses sessionStorage key to prevent repeated +1
 * from the same browser session.
 *
 * Query params:
 *   lang - Language code "zh" or "en" (required)
 *
 * Response: { success: true, viewCount: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
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

    // Increment viewCount atomically on the requested article
    const article = await prisma.article.update({
      where: {
        slug_language: { slug, language },
      },
      data: {
        viewCount: { increment: 1 },
      },
      select: {
        id: true,
        slug: true,
        viewCount: true,
        originalId: true,
        language: true,
      },
    });

    // Also increment the counterpart (the other language version of the same article)
    const counterpartSlug = article.slug;
    const counterpartLang = article.language === "zh" ? "en" : "zh";

    // Find the counterpart: either the original (if this is a translation) or the translation
    let counterpartId: string | null = null;
    if (article.originalId) {
      // This is a translation, update the original
      counterpartId = article.originalId;
    } else {
      // This is the original, look for a translation
      const translation = await prisma.article.findFirst({
        where: { originalId: article.id, slug: counterpartSlug, language: counterpartLang },
        select: { id: true },
      });
      if (translation) {
        counterpartId = translation.id;
      }
    }

    if (counterpartId) {
      await prisma.article.update({
        where: { id: counterpartId },
        data: { viewCount: { increment: 1 } },
      });
    }

    return NextResponse.json({
      success: true,
      viewCount: article.viewCount,
    });
  } catch (error) {
    console.error("View count increment error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
