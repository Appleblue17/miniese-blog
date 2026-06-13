/**
 * @file POST /api/admin/ai-tasks/[id]/retry
 *
 * Retries a failed or skipped AI task.
 * Resets status to "pending" and re-enqueues the job.
 *
 * Response: { taskId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addJob } from "@/lib/queue/producer";
import type { AiTaskType } from "@/types/ai";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const task = await prisma.aiTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "failed" && task.status !== "completed") {
      return NextResponse.json(
        { error: `Cannot retry task with status "${task.status}". Only failed or skipped tasks can be retried.` },
        { status: 400 },
      );
    }

    // Check if it's a skipped task (completed with output.skipped = true)
    const isSkipped =
      task.status === "completed" &&
      task.output !== null &&
      typeof task.output === "object" &&
      (task.output as Record<string, unknown>).skipped === true;

    if (!isSkipped && task.status === "completed") {
      return NextResponse.json(
        { error: "Cannot retry a completed task." },
        { status: 400 },
      );
    }

    // Reset status and re-enqueue
    const payload = (task.input ?? {}) as Record<string, unknown>;

    const taskId = await addJob(task.type as AiTaskType, payload);

    // Delete the old task record (new one was created by addJob)
    await prisma.aiTask.delete({ where: { id: task.id } });

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("Retry AI task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
