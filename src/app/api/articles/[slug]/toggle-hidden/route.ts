/**
 * @file POST /api/articles/[slug]/toggle-hidden
 *
 * Toggle the isHidden status of an article AND all its related translations.
 * Hidden articles are filtered from public listings, and direct URL returns 404.
 * This is an admin-only operation (checked by the caller/middleware).
 *
 * Query params (optional):
 *   lang - Language code "zh" or "en" (default: "zh")
 *
 * Response: { isHidden: boolean }
 *
 * Note: Hiding/unhiding applies to all language versions of the article
 * (original + translations) to keep them consistent.
 * The `lang` parameter is only used to look up one version of the article;
 * all associated versions are toggled together.
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
    const language = searchParams.get("lang") || "zh";

    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "lang query parameter must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    // Find the article
    const article = await prisma.article.findUnique({
      where: { slug_language: { slug, language } },
      select: { id: true, slug: true, isHidden: true, originalId: true },
    });

    if (!article) {
      return NextResponse.json(
        { error: `Article not found: "${slug}" in language "${language}".` },
        { status: 404 },
      );
    }

    const newHidden = !article.isHidden;

    // Collect all version IDs: the article itself, its original (if translated),
    // and all its translations
    const versionIds: string[] = [article.id];

    // If this article is a translation, include its original
    if (article.originalId) {
      versionIds.push(article.originalId);
    }

    // Find all translations of this article (including those linked via originalId)
    // and all translations of the original if applicable
    const rootId = article.originalId || article.id;
    const translations = await prisma.article.findMany({
      where: { originalId: rootId },
      select: { id: true },
    });
    for (const t of translations) {
      if (!versionIds.includes(t.id)) {
        versionIds.push(t.id);
      }
    }

    // Update all versions at once
    await prisma.article.updateMany({
      where: { id: { in: versionIds } },
      data: { isHidden: newHidden },
    });

    return NextResponse.json({ isHidden: newHidden });
  } catch (error) {
    console.error("Toggle hidden error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
