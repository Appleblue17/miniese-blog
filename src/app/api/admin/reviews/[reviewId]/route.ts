/**
 * @file GET /api/admin/reviews/[reviewId]
 *
 * Returns a single AI review task with full detail.
 *
 * Response: { task: ReviewTaskDetail }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface ReviewTaskDetail {
  id: string;
  type: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  articleId: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
): Promise<NextResponse> {
  try {
    const { reviewId } = await params;

    const task = await prisma.aiTask.findUnique({
      where: { id: reviewId },
    });

    if (!task) {
      return NextResponse.json({ error: "Review task not found." }, { status: 404 });
    }

    const detail: ReviewTaskDetail = {
      id: task.id,
      type: task.type,
      status: task.status,
      input: (task.input ?? {}) as Record<string, unknown>,
      output: task.output as Record<string, unknown> | null,
      error: task.error,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
      articleId: task.articleId,
    };

    return NextResponse.json({ task: detail });
  } catch (error) {
    console.error("Admin review detail error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
