/**
 * @file GET /api/admin/reviews
 *
 * Returns paginated AI review task records.
 * Query params: articleId (optional filter), page (default 1), limit (default 20)
 *
 * Now uses the relational articleId column instead of JSON filtering.
 *
 * Response: { tasks: ReviewTaskItem[], total, page, totalPages }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export interface ReviewTaskItem {
  id: string;
  type: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  articleId: string | null;
  articleTitle: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const articleIdFilter = searchParams.get("articleId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // Build Prisma where clause using the relational articleId column
    const where: Record<string, unknown> = { type: "review" };
    if (articleIdFilter) {
      where.articleId = articleIdFilter;
    }

    // Get total count
    const total = await prisma.aiTask.count({ where });

    // Get paginated results with article title
    const tasks = await prisma.aiTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        article: {
          select: { title: true },
        },
      },
    });

    const mapped: ReviewTaskItem[] = tasks.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      input: (t.input ?? {}) as Record<string, unknown>,
      output: t.output as Record<string, unknown> | null,
      error: t.error,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      articleId: t.articleId,
      articleTitle: t.article?.title ?? null,
    }));

    return NextResponse.json({
      tasks: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin reviews list error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
