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
 *   lang  - Language code "zh" or "en" (required)
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

    if (tag) {
      where.tags = { has: tag };
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
