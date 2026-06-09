/**
 * @file GET /api/articles
 *
 * Returns a paginated list of published articles.
 * Supports filtering by tag and language.
 *
 * Query params:
 *   page  - Page number (default: 1)
 *   limit - Items per page (default: 10, max: 100)
 *   tag   - Filter by tag (optional)
 *   lang  - Filter by language "zh" or "en" (optional)
 *
 * Response: { articles: [...], total: number, page: number, totalPages: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "10", 10)),
    );
    const tag = searchParams.get("tag");
    const language = searchParams.get("lang");

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: "published" };

    if (tag) {
      where.tags = { has: tag };
    }

    if (language === "zh" || language === "en") {
      where.language = language;
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
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
