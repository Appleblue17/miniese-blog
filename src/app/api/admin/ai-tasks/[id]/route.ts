/**
 * @file DELETE /api/admin/ai-tasks/[id]
 *
 * Deletes an AI task record AND removes the corresponding job from the Bull queue
 * (if it still exists — e.g. waiting for retry or in progress).
 *
 * Response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getQueue } from "@/lib/queue/client";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const task = await prisma.aiTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Remove the Bull queue job if it still exists (e.g. waiting for retry)
    try {
      const queue = getQueue();
      const job = await queue.getJob(id);
      if (job) {
        // Discard first to stop active processing, then remove
        await job.discard();
        await job.remove();
        console.log(`[Delete AI task] Removed Bull job ${id}`);
      }
    } catch (queueErr) {
      // Redis/Bull may not be available — log but don't block deletion
      console.warn(
        `[Delete AI task] Failed to remove Bull job ${id}: ${queueErr instanceof Error ? queueErr.message : String(queueErr)}`,
      );
    }

    await prisma.aiTask.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete AI task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
