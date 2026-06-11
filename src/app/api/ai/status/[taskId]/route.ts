/**
 * @file GET /api/ai/status/[taskId]
 *
 * Returns the current status of an AI task.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
): Promise<NextResponse> {
  try {
    const { taskId } = await params;

    const task = await prisma.aiTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        type: true,
        status: true,
        input: true,
        output: true,
        error: true,
        createdAt: true,
        completedAt: true,
        articleId: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error fetching task status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
