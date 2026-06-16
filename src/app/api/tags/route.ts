/**
 * @file GET /api/tags
 *
 * Returns all available tags aggregated from articles and wiki entries.
 *
 * Query params:
 *   type - "article" | "wiki" | "all" (default: "all")
 *   lang - "zh" | "en" (optional, filters by language)
 *
 * Response: { tags: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const lang = searchParams.get("lang");

    const tagSet = new Set<string>();

    if (type === "all" || type === "article") {
      const articleWhere: Record<string, unknown> = { status: "published" };
      if (lang === "zh" || lang === "en") articleWhere.language = lang;

      const articles = await prisma.article.findMany({
        where: articleWhere,
        select: { tags: true },
      });
      for (const article of articles) {
        for (const tag of article.tags) {
          tagSet.add(tag);
        }
      }
    }

    if (type === "all" || type === "wiki") {
      const wikiWhere: Record<string, unknown> = {
        status: { in: ["unreviewed", "reviewed"] },
      };
      if (lang === "zh" || lang === "en") wikiWhere.language = lang;

      const wikiEntries = await prisma.wikiEntry.findMany({
        where: wikiWhere,
        select: { tags: true },
      });
      for (const entry of wikiEntries) {
        for (const tag of entry.tags) {
          tagSet.add(tag);
        }
      }
    }

    const tags = Array.from(tagSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("List tags error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
