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

const VALID_TYPES = ["review", "translate", "generate", "discover"] as const;

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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // Build Prisma where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (typeFilter) {
      if (!VALID_TYPES.includes(typeFilter as (typeof VALID_TYPES)[number])) {
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

    // Batch lookup discovery term names for generate tasks
    const discoveryIds: string[] = [];
    const generateTasks = tasks.filter((t) => t.type === "generate" && !t.articleId);
    for (const t of generateTasks) {
      const input = (t.input ?? {}) as Record<string, unknown>;
      const discoveryId = input.discoveryId as string | undefined;
      if (discoveryId) {
        discoveryIds.push(discoveryId);
      }
    }

    // Batch query all discovery records for their term names
    const discoveries =
      discoveryIds.length > 0
        ? await prisma.wikiDiscovery.findMany({
            where: { id: { in: discoveryIds } },
            select: { id: true, term: true },
          })
        : [];

    const discoveryTermMap = new Map(discoveries.map((d) => [d.id, d.term]));

    const mapped: AiTaskItem[] = tasks.map((t) => {
      let articleTitle: string | null = t.article?.title ?? null;

      // For generate tasks without article, show the term name from input discovery
      if (!articleTitle && t.type === "generate") {
        const input = (t.input ?? {}) as Record<string, unknown>;
        const discoveryId = input.discoveryId as string | undefined;
        if (discoveryId) {
          const term = discoveryTermMap.get(discoveryId);
          articleTitle = term ? `词条: ${term}` : `词条(${discoveryId.slice(0, 8)}...)`;
        }
      }

      // Map "completed + skipped" to a display status of "skipped"
      const output = t.output as Record<string, unknown> | null;
      const displayStatus =
        t.status === "completed" && output?.skipped === true ? "skipped" : t.status;

      return {
        id: t.id,
        type: t.type,
        status: displayStatus,
        input: (t.input ?? {}) as Record<string, unknown>,
        output,
        error: t.error,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
        articleId: t.articleId,
        articleTitle,
      };
    });

    return NextResponse.json({
      tasks: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin AI tasks list error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
