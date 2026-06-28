/**
 * @file GET /api/admin/ai-tasks
 *
 * Returns paginated AI task records (review, translate, generate, etc.).
 * Query params: type (optional filter), articleId (optional filter), page (default 1), limit (default 20)
 *
 * Response: { tasks: AiTaskItem[], total, page, totalPages }
 */

import { NextRequest, NextResponse } from "next/server";
import { queryTasks, validateTaskType, VALID_TYPES } from "@/lib/ai/task-utils";
import type { AiTaskItem } from "@/lib/ai/task-utils";

export type { AiTaskItem };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type");
    const articleIdFilter = searchParams.get("articleId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    // Validate type filter
    if (typeFilter && !validateTaskType(typeFilter)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await queryTasks({
      type: typeFilter ?? undefined,
      articleId: articleIdFilter ?? undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Admin AI tasks list error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
