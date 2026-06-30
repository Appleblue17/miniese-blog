/**
 * @file POST /api/articles/[slug]/toggle-hidden
 *
 * Toggle the isHidden status of an article.
 * Hidden articles are filtered from public listings, and direct URL returns 404.
 * This is an admin-only operation (checked by the caller/middleware).
 *
 * Query params:
 *   lang - Language code "zh" or "en" (required)
 *
 * Response: { isHidden: boolean }
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

    const article = await prisma.article.findUnique({
      where: { slug_language: { slug, language } },
      select: { id: true, isHidden: true },
    });

    if (!article) {
      return NextResponse.json(
        { error: `Article not found: "${slug}" in language "${language}".` },
        { status: 404 },
      );
    }

    const updated = await prisma.article.update({
      where: { id: article.id },
      data: { isHidden: !article.isHidden },
      select: { isHidden: true },
    });

    return NextResponse.json({ isHidden: updated.isHidden });
  } catch (error) {
    console.error("Toggle hidden error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
