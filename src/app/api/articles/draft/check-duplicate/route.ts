/**
 * @file GET /api/articles/draft/check-duplicate?slug=xxx
 *
 * Checks whether a draft with the given slug already exists.
 * Used during upload to detect and warn about duplicate drafts.
 *
 * Query params:
 *   - slug: the slug to check (required)
 *   - excludeDraftId: optional draft ID to exclude (for update scenarios)
 *
 * Response: { exists: boolean, draft?: { id, title, updatedAt } }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const excludeDraftId = searchParams.get("excludeDraftId");

    if (!slug) {
      return NextResponse.json({ error: "slug query parameter is required." }, { status: 400 });
    }

    // Build query: find drafts with matching slug (title-derived)
    // Since slug in the DB is a random `draft-{timestamp}`, we match by title.
    // We generate the same slug from the title again, so we search for drafts
    // that have a contentPath containing the slug-derived directory name.
    const draftDirPattern = `content/articles/drafts/${slug}/`;

    const existingDraft = await prisma.article.findFirst({
      where: {
        status: { in: ["draft", "review"] },
        contentPath: { startsWith: draftDirPattern },
        ...(excludeDraftId ? { id: { not: excludeDraftId } } : {}),
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (existingDraft) {
      return NextResponse.json({
        exists: true,
        draft: {
          id: existingDraft.id,
          title: existingDraft.title,
          updatedAt: existingDraft.updatedAt.toISOString(),
        },
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error("Check duplicate draft error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
