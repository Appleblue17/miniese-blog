/**
 * @file GET /api/admin/articles/link-status
 *
 * Returns link status for published articles:
 * - When each article's wiki links were last detected (detectedAt)
 * - The link count per article
 * - Total wiki entry count in the system (for reference)
 *
 * Query params (optional):
 *   - articleIds: comma-separated list of article IDs to filter
 *
 * Response:
 *   {
 *     articles: Array<{
 *       id, slug, title, language,
 *       linkCount, lastDetectedAt,
 *       wikiEntryCount
 *     }>,
 *     totalWikiEntries: number,
 *     staleThresholdDays: number
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const STALE_THRESHOLD_DAYS = 7;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const articleIdsParam = searchParams.get("articleIds");

    let articleFilter: Record<string, unknown> = {};
    if (articleIdsParam) {
      const ids = articleIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        articleFilter.id = { in: ids };
      }
    }

    // Get all published original articles
    const articles = await prisma.article.findMany({
      where: {
        status: "published",
        originalId: null,
        ...articleFilter,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        language: true,
        renderedContent: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    // Get wiki link counts per article
    const articleIds = articles.map((a) => a.id);
    const linkGroups = await prisma.articleWikiLink.groupBy({
      by: ["articleId"],
      where: { articleId: { in: articleIds } },
      _count: { id: true },
      _max: { detectedAt: true },
    });

    const linkMap = new Map<string, { count: number; lastDetected: Date | null }>();
    for (const group of linkGroups) {
      linkMap.set(group.articleId, {
        count: group._count.id,
        lastDetected: group._max.detectedAt,
      });
    }

    // Get total wiki entry count
    const totalWikiEntries = await prisma.wikiEntry.count({
      where: { status: { not: "deleted" } },
    });

    // Get wiki entry count for each article's language
    const wikiEntryCountsByLang = await prisma.wikiEntry.groupBy({
      by: ["language"],
      where: { status: { not: "deleted" } },
      _count: { id: true },
    });
    const wikiEntryMap = new Map<string, number>();
    for (const g of wikiEntryCountsByLang) {
      wikiEntryMap.set(g.language, g._count.id);
    }

    const now = new Date();
    const articlesWithStatus = articles.map((a) => {
      const linkInfo = linkMap.get(a.id);
      const lastDetected = linkInfo?.lastDetected || null;
      const linkCount = linkInfo?.count || 0;

      // Determine if stale: no links ever, or last detected more than threshold days ago
      let isStale = false;
      if (lastDetected) {
        const daysSinceDetection = (now.getTime() - lastDetected.getTime()) / (1000 * 60 * 60 * 24);
        isStale = daysSinceDetection > STALE_THRESHOLD_DAYS;
      } else {
        // Never linked — stale if has renderedContent and wiki entries exist for this language
        const langEntryCount = wikiEntryMap.get(a.language) || 0;
        isStale = langEntryCount > 0;
      }

      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        language: a.language,
        linkCount,
        lastDetectedAt: lastDetected?.toISOString() || null,
        isStale,
        hasRenderedContent: !!a.renderedContent,
        wikiEntryCount: wikiEntryMap.get(a.language) || 0,
      };
    });

    return NextResponse.json({
      articles: articlesWithStatus,
      totalWikiEntries,
      staleThresholdDays: STALE_THRESHOLD_DAYS,
    });
  } catch (error) {
    console.error("Link status error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
