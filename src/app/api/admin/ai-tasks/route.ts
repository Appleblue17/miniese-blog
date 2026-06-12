/**
 * @file GET /api/admin/ai-tasks
 *
 * Returns paginated AI task records (review, translate, generate, etc.).
 * Query params: type (optional filter), articleId (optional filter), page (default 1), limit (default 20)
 *
 * Response: { tasks: AiTaskItem[], total, page, totalPages }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const VALID_TYPES = ["review", "translate"] as const;

export interface AiTaskItem {
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
    const typeFilter = searchParams.get("type");
    const articleIdFilter = searchParams.get("articleId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );

    // Build Prisma where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (typeFilter) {
      if (!VALID_TYPES.includes(typeFilter as typeof VALID_TYPES[number])) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
      where.type = typeFilter;
    }

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

    const mapped: AiTaskItem[] = tasks.map((t) => ({
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
    console.error("Admin AI tasks list error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
