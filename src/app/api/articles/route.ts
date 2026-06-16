/**
 * @file GET /api/articles
 *
 * Returns a paginated list of published articles.
 * Supports filtering by tag, full-text search, and tag include/exclude.
 *
 * Query params:
 *   page       - Page number (default: 1)
 *   limit      - Items per page (default: 10, max: 100)
 *   tag        - Filter by single tag (optional, legacy)
 *   lang       - Language code "zh" or "en" (required)
 *   q          - Search query (matches title, summary, tags)
 *   tagFilter  - Comma-separated tags to include (AND logic)
 *   tagExclude - Comma-separated tags to exclude
 *
 * Response: { articles: [...], total: number, page: number, totalPages: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings } from "../../../../config/settings";

export async function GET(request: NextRequest) {
  try {
    const settings = await getSettings();
    const defaultLimit = settings.pagination?.articlesPerPage ?? 10;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || String(defaultLimit), 10)));
    const tag = searchParams.get("tag");
    const language = searchParams.get("lang");
    const q = searchParams.get("q");
    const tagFilter = searchParams.get("tagFilter");
    const tagExclude = searchParams.get("tagExclude");

    // lang is required
    if (language !== "zh" && language !== "en") {
      return NextResponse.json(
        { error: "lang query parameter is required. Must be 'zh' or 'en'." },
        { status: 400 },
      );
    }

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: "published", language };

    // Legacy single-tag filter
    if (tag) {
      where.tags = { has: tag };
    }

    // Full-text search: match against title, summary, and tags
    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: searchTerm, mode: "insensitive" as const } },
            { summary: { contains: searchTerm, mode: "insensitive" as const } },
            { tags: { has: searchTerm } },
          ],
        },
      ];
    }

    // Tag include filter (AND logic — article must have ALL specified tags)
    if (tagFilter && tagFilter.trim()) {
      const includeTags = tagFilter.split(",").map((t) => t.trim()).filter(Boolean);
      if (includeTags.length > 0) {
        const andClause = where.AND || [];
        andClause.push({ tags: { hasEvery: includeTags } });
        where.AND = andClause;
      }
    }

    // Tag exclude filter (article must NOT have any of the specified tags)
    if (tagExclude && tagExclude.trim()) {
      const excludeTags = tagExclude.split(",").map((t) => t.trim()).filter(Boolean);
      if (excludeTags.length > 0) {
        const andClause = where.AND || [];
        andClause.push({ tags: { hasSome: excludeTags } });
        where.NOT = { tags: { hasSome: excludeTags } };
      }
    }

    // Execute query and count in parallel
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
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
        },
      }),
      prisma.article.count({ where }),
    ]);

    return NextResponse.json({
      articles: articles.map((a: { publishedAt: Date | null; updatedAt: Date }) => ({
        ...a,
        publishedAt: a.publishedAt?.toISOString() || null,
        updatedAt: a.updatedAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("List articles error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
